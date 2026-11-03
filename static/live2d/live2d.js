/*!
 * doudizhu-arena Live2D 模块
 * 包含 Live2D Cubism Web Framework 5-r.5（Copyright(c) Live2D Inc.，Live2D Open Software License：
 * https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html）
 * 不包含 Live2D Cubism Core（专有组件，需从官方 SDK 获取，见 static/live2d/core/README.md）
 */
(function () {
  'use strict';
  var defs = {}, mods = {};
  function define(name, deps, factory) { defs[name] = { deps: deps, factory: factory }; }
  function req(name) {
    if (mods[name]) return mods[name].exports;
    var d = defs[name];
    if (!d) throw new Error('[Live2D] bundle 缺少模块 ' + name);
    var m = { exports: {} };
    mods[name] = m;
    var args = d.deps.map(function (x) { return x === 'require' ? req : x === 'exports' ? m.exports : req(x); });
    var r = d.factory.apply(null, args);
    if (r !== undefined) m.exports = r;
    return m.exports;
  }
  var __l2dRequire = req;
define("src/animation", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AnimationCore = exports.INTERACTIONS = exports.EMOTIONS = exports.P = void 0;
    exports.checkWave = checkWave;
    exports.P = {
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
    };
    exports.EMOTIONS = [
        'neutral',
        'happy',
        'angry',
        'sad',
        'surprised',
        'thinking',
        'shy',
        'confident'
    ];
    const EMOTION_POSE = {
        neutral: {},
        happy: { angleY: 3, angleZ: 4, bodyZ: 1.5 },
        angry: { angleY: -5, angleX: -3, bodyY: -2 },
        sad: { angleY: -11, angleZ: -3, bodyY: -3, eyeY: -0.4 },
        surprised: { angleY: 6, bodyY: 2 },
        thinking: { angleX: -9, angleY: 4, angleZ: 8, eyeX: -0.55, eyeY: 0.6 },
        shy: { angleX: 7, angleY: -6, angleZ: 5, eyeX: -0.5, eyeY: -0.35 },
        confident: { angleY: 6, angleZ: -4, bodyZ: 2.5 }
    };
    const EMOTION_FACE = {
        neutral: {},
        happy: { mouthForm: 1, eyeLSmile: 0.8, eyeRSmile: 0.8, browLY: 0.3, browRY: 0.3 },
        angry: { mouthForm: -0.7, browLForm: -1, browRForm: -1, browLAngle: -0.8, browRAngle: -0.8, browLY: -0.4, browRY: -0.4 },
        sad: { mouthForm: -1, browLForm: -0.6, browRForm: -0.6, browLAngle: 0.7, browRAngle: 0.7 },
        surprised: { browLY: 1, browRY: 1, mouthForm: 0 },
        thinking: { mouthForm: -0.3, browLY: 0.4, browRY: -0.2 },
        shy: { cheek: 1, mouthForm: 0.4, eyeLSmile: 0.4, eyeRSmile: 0.4 },
        confident: { mouthForm: 0.7, browLY: 0.2, browRY: 0.2, eyeLSmile: 0.3, eyeRSmile: 0.3 }
    };
    const EMOTION_EYE = { surprised: 1.25, sad: 0.82, angry: 0.88, confident: 0.92, shy: 0.85 };
    exports.INTERACTIONS = ['nod', 'shake', 'lowerHead', 'tilt', 'wave'];
    const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const envelope = (t, dur, fin = 0.15, fout = 0.22) => Math.min(ease(t / fin), ease((dur - t) / fout));
    const CURVES = {
        nod: {
            dur: 1.0,
            f: (t) => {
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
    class Wander {
        constructor(amp, hold, stiffness = 6, sineAmp = 0.25) {
            this.amp = amp;
            this.hold = hold;
            this.stiffness = stiffness;
            this.sineAmp = sineAmp;
            this.x = 0;
            this.v = 0;
            this.target = 0;
            this.next = 0;
            this.t = Math.random() * 100;
            this.f1 = 0.11 + Math.random() * 0.06;
            this.f2 = 0.23 + Math.random() * 0.09;
        }
        step(dt, rnd) {
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
        reset() {
            this.x = this.v = 0;
        }
    }
    class Smooth {
        constructor(k = 14) {
            this.k = k;
            this.x = 0;
            this.v = 0;
        }
        step(target, dt) {
            const k = this.k;
            const a = k * k * (target - this.x) - 2 * k * this.v;
            this.v += a * dt;
            this.x += this.v * dt;
            return this.x;
        }
    }
    function checkWave(t, w) {
        if (!w)
            return { ok: false, missing: ['wave 配置'] };
        const missing = [];
        if (w.param && !t.has(w.param))
            missing.push(w.param);
        if (w.swing && !t.has(w.swing.param))
            missing.push(w.swing.param);
        for (const id of [...(w.showParts || []), ...(w.hideParts || [])])
            if (!t.hasPart(id))
                missing.push(id);
        for (const id of Object.keys(w.hold || {}))
            if (!t.has(id))
                missing.push(id);
        const drives = (!!w.param && t.has(w.param)) || (!!w.swing && t.has(w.swing.param));
        return { ok: drives && !missing.length, missing };
    }
    class AnimationCore {
        constructor(target, opts = {}) {
            var _a;
            this.target = target;
            this.opts = opts;
            this.idle = true;
            this.speaking = false;
            this.emotion = 'neutral';
            this.mouth = 0;
            this.emoW = new Map();
            this.emotionUsesExpression = false;
            this.smooth = {};
            this.active = null;
            this.headOverride = null;
            this.headW = 0;
            this.eyeOverride = null;
            this.eyeW = 0;
            this.lastEye = 1;
            this.speakW = 0;
            this.speakPhase = 0;
            this.mouthPrev = 0;
            this.nodKick = 0;
            this.wave = null;
            this.overrides = new Map();
            this.partOverrides = new Map();
            this.rnd = opts.random || Math.random;
            this.idleScale = (_a = opts.idleScale) !== null && _a !== void 0 ? _a : 1;
            this.wander = {
                angleX: new Wander(9, [2.2, 5.5], 2.6),
                angleY: new Wander(4.5, [2.5, 6], 2.4),
                angleZ: new Wander(4, [3, 7], 2.0),
                bodyX: new Wander(3, [3, 7], 1.6),
                bodyZ: new Wander(2, [3.5, 8], 1.4),
                eyeX: new Wander(0.38, [0.6, 2.8], 18, 0.05),
                eyeY: new Wander(0.2, [0.8, 3], 18, 0.05)
            };
            for (const e of exports.EMOTIONS)
                this.emoW.set(e, e === 'neutral' ? 1 : 0);
        }
        capabilities() {
            var _a, _b, _c, _d, _e;
            const t = this.target;
            const head = t.has(exports.P.angleX) || t.has(exports.P.angleY) || t.has(exports.P.angleZ);
            const w = this.opts.wave;
            return {
                head,
                body: t.has(exports.P.bodyX) || t.has(exports.P.bodyZ),
                eyeBall: t.has(exports.P.eyeX),
                eyeOpen: t.has(exports.P.eyeLOpen) || t.has(exports.P.eyeROpen),
                mouthOpen: t.has(exports.P.mouthOpen),
                mouthForm: t.has(exports.P.mouthForm),
                nod: head || !!((_a = this.opts.motions) === null || _a === void 0 ? void 0 : _a.nod),
                shake: head || !!((_b = this.opts.motions) === null || _b === void 0 ? void 0 : _b.shake),
                lowerHead: head || !!((_c = this.opts.motions) === null || _c === void 0 ? void 0 : _c.lowerHead),
                tilt: head || !!((_d = this.opts.motions) === null || _d === void 0 ? void 0 : _d.tilt),
                wave: !!(((_e = this.opts.motions) === null || _e === void 0 ? void 0 : _e.wave) || (w && (w.motion || checkWave(t, w).ok))),
                emotionParams: exports.EMOTIONS.filter((e) => Object.keys({ ...EMOTION_POSE[e], ...EMOTION_FACE[e] }).some((k) => t.has(exports.P[k])))
            };
        }
        setEmotion(e, usesExpression) {
            this.emotion = e;
            this.emotionUsesExpression = usesExpression;
        }
        setHead(x, y, z) {
            this.headOverride = { x, y, z };
        }
        clearHead() {
            this.headOverride = null;
        }
        setEye(v) {
            this.eyeOverride = v;
            if (v !== null)
                this.lastEye = v;
        }
        startInteraction(name, priority) {
            if (this.active && this.active.priority > priority)
                return null;
            if (this.active)
                this.active.resolve('interrupted');
            const c = CURVES[name];
            return new Promise((resolve) => {
                this.active = { name, t: 0, dur: c.dur, priority, curve: c.f, resolve };
            });
        }
        startWaveParam(cfg, priority) {
            if (!checkWave(this.target, cfg).ok)
                return null;
            if (this.active && this.active.priority > priority)
                return null;
            if (this.active)
                this.active.resolve('interrupted');
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
                        return { angleZ: 4 * k * Math.sin(t * Math.PI * 2 * hz), angleY: 2 * k, bodyZ: 2 * k };
                    }
                };
            });
        }
        applyWave(dt) {
            var _a, _b, _c;
            const w = this.wave;
            if (!w)
                return;
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
                    const r = t.range(c.param);
                    const to = (_a = c.to) !== null && _a !== void 0 ? _a : r.max;
                    const v = Math.min(r.max, Math.max(r.min, to + (c.armSwing || 0) * ph));
                    t.set(c.param, v, k);
                }
                if (c.swing && t.has(c.swing.param)) {
                    const r = t.range(c.swing.param);
                    const center = (_b = c.swing.center) !== null && _b !== void 0 ? _b : (r.min + r.max) / 2;
                    const amp = (_c = c.swing.amp) !== null && _c !== void 0 ? _c : (r.max - r.min) / 2;
                    t.set(c.swing.param, Math.min(r.max, Math.max(r.min, center + amp * ph)), k);
                }
                for (const [id, v] of Object.entries(c.hold || {})) {
                    const r = t.range(id);
                    if (r)
                        t.set(id, Math.min(r.max, Math.max(r.min, v)), k);
                }
                const pk = Math.min(1, k * 2.5);
                for (const id of showP)
                    t.setPart(id, Math.max(t.getPart(id), pk));
                for (const id of hideP)
                    t.setPart(id, Math.min(t.getPart(id), 1 - pk));
            }
            else {
                w.restore += dt;
                const k = Math.min(1, w.restore / 0.4);
                for (const id of showP)
                    t.setPart(id, Math.min(t.getPart(id), 1 - k));
                for (const id of hideP)
                    t.setPart(id, Math.max(t.getPart(id), k));
                if (k >= 1)
                    this.wave = null;
            }
        }
        checkWave(w) {
            return checkWave(this.target, w);
        }
        overrideParam(id, v) {
            if (v === null)
                this.overrides.delete(id);
            else
                this.overrides.set(id, v);
        }
        overridePart(id, v) {
            if (v === null)
                this.partOverrides.delete(id);
            else
                this.partOverrides.set(id, v);
        }
        overriddenParams() {
            return this.overrides;
        }
        cancelInteraction() {
            if (this.active)
                this.active.resolve('interrupted');
            this.active = null;
        }
        get interaction() {
            return this.active ? this.active.name : null;
        }
        apply(dt) {
            var _a;
            dt = Math.min(0.1, Math.max(0, dt));
            const t = this.target;
            const out = {};
            const add = (k, v) => (out[k] = (out[k] || 0) + v);
            const idleK = this.idle ? this.idleScale : 0;
            for (const k of Object.keys(this.wander)) {
                const v = this.wander[k].step(dt, this.rnd);
                if (idleK)
                    add(k, v * idleK);
            }
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
            const ek = 1 - Math.exp(-dt / 0.35);
            let eyeMul = 1;
            for (const e of exports.EMOTIONS) {
                const w0 = this.emoW.get(e) || 0;
                const w = w0 + ((e === this.emotion ? 1 : 0) - w0) * ek;
                this.emoW.set(e, w);
                if (w < 0.001)
                    continue;
                for (const [k, v] of Object.entries(EMOTION_POSE[e]))
                    add(k, v * w);
                if (!this.emotionUsesExpression || e !== this.emotion) {
                    for (const [k, v] of Object.entries(EMOTION_FACE[e]))
                        add('face:' + k, v * w);
                }
                if (EMOTION_EYE[e])
                    eyeMul *= 1 + (EMOTION_EYE[e] - 1) * w;
            }
            this.applyWave(dt);
            if (this.active) {
                const a = this.active;
                a.t += dt;
                const pose = a.curve(a.t);
                const env = a.name === 'nod' || a.name === 'shake' ? envelope(a.t, a.dur, 0.08, 0.2) : 1;
                for (const [k, v] of Object.entries(pose))
                    add(k, v * env);
                if (a.t >= a.dur) {
                    this.active = null;
                    a.resolve('done');
                }
            }
            this.headW += ((this.headOverride ? 1 : 0) - this.headW) * (1 - Math.exp(-dt / 0.18));
            const ho = this.headOverride || { x: 0, y: 0, z: 0 };
            for (const k of ['angleX', 'angleY', 'angleZ', 'bodyX', 'bodyY', 'bodyZ', 'eyeX', 'eyeY']) {
                let v = out[k] || 0;
                if (this.headW > 0.001 && (k === 'angleX' || k === 'angleY' || k === 'angleZ')) {
                    const m = k === 'angleX' ? ho.x : k === 'angleY' ? ho.y : ho.z;
                    v = v * (1 - this.headW) + m * this.headW;
                }
                const s = ((_a = this.smooth)[k] || (_a[k] = new Smooth(k.startsWith('eye') ? 22 : 15)));
                const y = s.step(v, dt);
                if (t.has(exports.P[k]))
                    t.add(exports.P[k], y);
            }
            for (const [k, v] of Object.entries(out)) {
                if (!k.startsWith('face:'))
                    continue;
                const pk = k.slice(5);
                if (t.has(exports.P[pk]))
                    t.add(exports.P[pk], v);
            }
            this.eyeW += ((this.eyeOverride !== null ? 1 : 0) - this.eyeW) * (1 - Math.exp(-dt / 0.12));
            for (const id of [exports.P.eyeLOpen, exports.P.eyeROpen]) {
                if (!t.has(id))
                    continue;
                if (Math.abs(eyeMul - 1) > 0.001)
                    t.mul(id, eyeMul);
                if (this.eyeW > 0.001)
                    t.set(id, this.lastEye, this.eyeW);
            }
            for (const [id, v] of this.overrides)
                if (t.has(id))
                    t.set(id, v, 1);
            for (const [id, v] of this.partOverrides)
                if (t.hasPart(id))
                    t.setPart(id, v);
        }
        destroy() {
            this.cancelInteraction();
        }
    }
    exports.AnimationCore = AnimationCore;
});
define("framework/src/motion/iparameterprovider", ["require", "exports", "framework/src/motion/iparameterprovider"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.IParameterProvider = void 0;
    class IParameterProvider {
        constructor() { }
    }
    exports.IParameterProvider = IParameterProvider;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.IParameterProvider = $.IParameterProvider;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("src/audio", ["require", "exports", "framework/src/motion/iparameterprovider"], function (require, exports, iparameterprovider_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DAudioSync = exports.MouthEnvelope = void 0;
    exports.estimateMouth = estimateMouth;
    exports.setAudioContextProvider = setAudioContextProvider;
    exports.audioContext = audioContext;
    exports.unlockAudio = unlockAudio;
    class MouthEnvelope {
        constructor() {
            this.value = 0;
            this.target = 0;
            this.attack = 0.045;
            this.release = 0.11;
            this.floorDb = -52;
            this.ceilDb = -14;
            this.gate = 0.07;
        }
        levelFromRms(rms) {
            if (!(rms > 0))
                return 0;
            const db = 20 * Math.log10(rms);
            let l = (db - this.floorDb) / (this.ceilDb - this.floorDb);
            l = Math.min(1, Math.max(0, l));
            if (l < this.gate)
                return 0;
            return Math.pow((l - this.gate) / (1 - this.gate), 0.85);
        }
        step(dt) {
            const tau = this.target > this.value ? this.attack : this.release;
            const k = 1 - Math.exp(-Math.max(0, dt) / tau);
            this.value += (this.target - this.value) * k;
            if (this.value < 0.004 && this.target === 0)
                this.value = 0;
            return this.value;
        }
    }
    exports.MouthEnvelope = MouthEnvelope;
    function estimateMouth(text, duration, t) {
        if (t < 0 || t > duration || !text)
            return 0;
        const chars = [...text.replace(/\s+/g, '')];
        if (!chars.length)
            return 0;
        const per = duration / chars.length;
        const i = Math.min(chars.length - 1, Math.floor(t / per));
        const c = chars[i];
        if (/[，。！？、,.!?…~～：；:;]/.test(c))
            return 0;
        const phase = (t - i * per) / per;
        const seed = (c.codePointAt(0) || 0) % 7;
        const peak = 0.55 + seed * 0.06;
        return peak * Math.sin(Math.PI * Math.min(1, phase * 1.15));
    }
    let ctxProvider = null;
    let ownCtx = null;
    function setAudioContextProvider(fn) {
        ctxProvider = fn;
    }
    function audioContext() {
        if (ctxProvider) {
            const c = ctxProvider();
            if (c)
                return c;
        }
        if (!ownCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC)
                return null;
            try {
                ownCtx = new AC();
            }
            catch (e) {
                return null;
            }
        }
        return ownCtx;
    }
    function unlockAudio() {
        const c = audioContext();
        if (!c)
            return Promise.resolve(false);
        if (c.state === 'running')
            return Promise.resolve(true);
        return c.resume().then(() => c.state === 'running', () => false);
    }
    const elementSources = new WeakMap();
    function sameOrigin(url) {
        try {
            const u = new URL(url, location.href);
            return u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:';
        }
        catch (e) {
            return false;
        }
    }
    class Live2DAudioSync extends iparameterprovider_1.IParameterProvider {
        constructor() {
            super(...arguments);
            this.env = new MouthEnvelope();
            this.source = 'none';
            this.rms = 0;
            this.analyser = null;
            this.buf = null;
            this.el = null;
            this.elHandlers = [];
            this.estText = '';
            this.estDur = 0;
            this.estT = 0;
            this.manualValue = 0;
            this.listeners = [];
        }
        onSpeaking(fn) {
            this.listeners.push(fn);
        }
        emit(on) {
            for (const f of this.listeners)
                f(on);
        }
        attach(el, fallbackText = '', fallbackDuration = 0) {
            this.stop();
            const ctx = audioContext();
            const url = el.currentSrc || el.src;
            const canAnalyze = !!ctx && ctx.state === 'running' && (sameOrigin(url) || !!el.crossOrigin);
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
                ]) {
                    el.addEventListener(n, h);
                    this.elHandlers.push([n, h]);
                }
                this.source = 'audio';
                this.emit(true);
                return 'audio';
            }
            if (fallbackText && fallbackDuration > 0) {
                this.estimate(fallbackText, fallbackDuration);
                const onEnd = () => this.stop();
                for (const n of ['ended', 'pause', 'error']) {
                    el.addEventListener(n, onEnd);
                    this.elHandlers.push([n, onEnd]);
                }
                this.el = el;
                return 'estimate';
            }
            return 'none';
        }
        estimate(text, duration) {
            if (this.source === 'audio')
                this.detachElement();
            this.estText = text;
            this.estDur = Math.max(0.2, duration);
            this.estT = 0;
            this.source = 'estimate';
            this.emit(true);
        }
        manual(v) {
            if (v === null) {
                if (this.source === 'manual')
                    this.stop();
                return;
            }
            if (this.source === 'audio')
                this.detachElement();
            this.manualValue = Math.min(1, Math.max(0, v));
            this.source = 'manual';
        }
        detachElement() {
            if (this.el)
                for (const [n, h] of this.elHandlers)
                    this.el.removeEventListener(n, h);
            this.elHandlers = [];
            if (this.analyser) {
                try {
                    const src = this.el ? elementSources.get(this.el) : null;
                    if (src)
                        src.disconnect(this.analyser);
                    this.analyser.disconnect();
                    if (src && this.el && !this.el.ended)
                        src.connect(audioContext().destination);
                }
                catch (e) {
                }
            }
            this.analyser = null;
            this.buf = null;
            this.el = null;
        }
        stop() {
            const was = this.source !== 'none';
            this.detachElement();
            this.source = 'none';
            this.env.target = 0;
            this.rms = 0;
            if (was)
                this.emit(false);
        }
        get speaking() {
            return this.source === 'audio' || this.source === 'estimate';
        }
        update(dt = 1 / 60) {
            switch (this.source) {
                case 'audio': {
                    if (this.analyser && this.buf && this.el && !this.el.paused) {
                        this.analyser.getFloatTimeDomainData(this.buf);
                        let s = 0;
                        for (let i = 0; i < this.buf.length; i++)
                            s += this.buf[i] * this.buf[i];
                        this.rms = Math.sqrt(s / this.buf.length);
                        this.env.target = this.env.levelFromRms(this.rms);
                    }
                    else
                        this.env.target = 0;
                    break;
                }
                case 'estimate':
                    this.estT += dt;
                    this.env.target = estimateMouth(this.estText, this.estDur, this.estT);
                    if (this.estT > this.estDur + 0.2)
                        this.stop();
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
        getParameter() {
            return this.env.value;
        }
        async playTest(url) {
            await unlockAudio();
            const a = new Audio();
            a.src = url;
            a.preload = 'auto';
            const mode = this.attach(a, '测试音频', 3);
            await a.play();
            if (mode === 'none')
                this.estimate('测试音频', a.duration || 3);
            return a;
        }
        destroy() {
            this.stop();
            this.listeners = [];
        }
    }
    exports.Live2DAudioSync = Live2DAudioSync;
});
define("src/boot", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_CORE_URLS = void 0;
    exports.onLog = onLog;
    exports.log = log;
    exports.loadCoreScript = loadCoreScript;
    exports.webglSupport = webglSupport;
    exports.DEFAULT_CORE_URLS = ['live2d/core/live2dcubismcore.min.js'];
    const sinks = [];
    function onLog(fn) {
        sinks.push(fn);
        return () => {
            const i = sinks.indexOf(fn);
            if (i >= 0)
                sinks.splice(i, 1);
        };
    }
    function log(level, msg) {
        const line = `[Live2D] ${msg}`;
        if (level === 'error')
            console.error(line);
        else if (level === 'warn')
            console.warn(line);
        else
            console.info(line);
        for (const s of sinks) {
            try {
                s(level, msg);
            }
            catch (e) {
            }
        }
    }
    function coreGlobal() {
        return window.Live2DCubismCore;
    }
    function injectScript(url) {
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
    function describeVersion(n) {
        return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${n & 0xffff}`;
    }
    let corePromise = null;
    function loadCoreScript(urls = exports.DEFAULT_CORE_URLS) {
        if (corePromise)
            return corePromise;
        corePromise = (async () => {
            const tried = [];
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
                    }
                    catch (e) {
                        tried.push(u);
                    }
                }
            }
            const core = coreGlobal();
            if (!core || !core.Version || typeof core.Version.csmGetVersion !== 'function') {
                throw new Error('没有找到 Live2D Cubism Core。请从 Live2D 官网下载 Cubism SDK for Web，同意授权协议后，' +
                    '把 Core/live2dcubismcore.min.js 放到 static/live2d/core/。已尝试：' +
                    (tried.join('、') || '无'));
            }
            const n = core.Version.csmGetVersion();
            const latest = core.Version.csmGetLatestMocVersion ? core.Version.csmGetLatestMocVersion() : -1;
            const info = { version: describeVersion(n), versionNumber: n, latestMocVersion: latest, url };
            log('info', `Cubism Core ${info.version} 已加载（${url}），支持 moc3 版本 ≤ ${latest}`);
            return info;
        })();
        corePromise.catch(() => {
            corePromise = null;
        });
        return corePromise;
    }
    function webglSupport() {
        var _a, _b;
        const out = { webgl2: false, webgl: false };
        try {
            const c = document.createElement('canvas');
            const g2 = c.getContext('webgl2');
            out.webgl2 = !!g2;
            if (g2)
                (_a = g2.getExtension('WEBGL_lose_context')) === null || _a === void 0 ? void 0 : _a.loseContext();
            if (!g2) {
                const g1 = document.createElement('canvas').getContext('webgl');
                out.webgl = !!g1;
                if (g1)
                    (_b = g1.getExtension('WEBGL_lose_context')) === null || _b === void 0 ? void 0 : _b.loseContext();
            }
            else
                out.webgl = true;
        }
        catch (e) {
        }
        return out;
    }
});
define("src/entry", ["require", "exports", "src/animation", "src/audio", "src/boot"], function (require, exports, animation_1, audio_1, boot_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    let full = null;
    let fullPromise = null;
    const api = {
        version: '1.0.0',
        framework: 'CubismWebFramework 5-r.5（Cubism 5 SDK for Web R5）',
        DEFAULT_CORE_URLS: boot_1.DEFAULT_CORE_URLS,
        webglSupport: boot_1.webglSupport,
        onLog: boot_1.onLog,
        AnimationCore: animation_1.AnimationCore,
        EMOTIONS: animation_1.EMOTIONS,
        INTERACTIONS: animation_1.INTERACTIONS,
        Live2DAudioSync: audio_1.Live2DAudioSync,
        MouthEnvelope: audio_1.MouthEnvelope,
        estimateMouth: audio_1.estimateMouth,
        audioContext: audio_1.audioContext,
        setAudioContextProvider: audio_1.setAudioContextProvider,
        unlockAudio: audio_1.unlockAudio,
        coreLoaded: () => !!full && full.coreLoaded(),
        loadCore(urls) {
            if (fullPromise)
                return fullPromise;
            fullPromise = (0, boot_1.loadCoreScript)(urls).then(async (info) => {
                if (!full)
                    full = __l2dRequire('src/index').default;
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
    window.Live2D = api;
    exports.default = api;
});
define("framework/src/id/cubismid", ["require", "exports", "framework/src/id/cubismid"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismId = void 0;
    class CubismId {
        static createIdInternal(id) {
            return new CubismId(id);
        }
        getString() {
            return this._id;
        }
        isEqual(c) {
            if (typeof c === 'string') {
                return this._id == c;
            }
            else if (c instanceof CubismId) {
                return this._id == c._id;
            }
            return false;
        }
        isNotEqual(c) {
            if (typeof c == 'string') {
                return !(this._id == c);
            }
            else if (c instanceof CubismId) {
                return !(this._id == c._id);
            }
            return false;
        }
        constructor(id) {
            this._id = id;
        }
    }
    exports.CubismId = CubismId;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismId = $.CubismId;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/id/cubismidmanager", ["require", "exports", "framework/src/id/cubismid", "framework/src/id/cubismidmanager"], function (require, exports, cubismid_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismIdManager = void 0;
    class CubismIdManager {
        constructor() {
            this._ids = new Array();
        }
        release() {
            for (let i = 0; i < this._ids.length; ++i) {
                this._ids[i] = void 0;
            }
            this._ids = null;
        }
        registerIds(ids) {
            for (let i = 0; i < ids.length; i++) {
                this.registerId(ids[i]);
            }
        }
        registerId(id) {
            let result = null;
            if ('string' == typeof id) {
                if ((result = this.findId(id)) != null) {
                    return result;
                }
                result = cubismid_1.CubismId.createIdInternal(id);
                this._ids.push(result);
            }
            else {
                return this.registerId(id);
            }
            return result;
        }
        getId(id) {
            return this.registerId(id);
        }
        isExist(id) {
            if ('string' == typeof id) {
                return this.findId(id) != null;
            }
            return this.isExist(id);
        }
        findId(id) {
            for (let i = 0; i < this._ids.length; ++i) {
                if (this._ids[i].getString() == id) {
                    return this._ids[i];
                }
            }
            return null;
        }
    }
    exports.CubismIdManager = CubismIdManager;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismIdManager = $.CubismIdManager;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/math/cubismvector2", ["require", "exports", "framework/src/math/cubismvector2"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismVector2 = void 0;
    class CubismVector2 {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.x = x == undefined ? 0.0 : x;
            this.y = y == undefined ? 0.0 : y;
        }
        add(vector2) {
            const ret = new CubismVector2(0.0, 0.0);
            ret.x = this.x + vector2.x;
            ret.y = this.y + vector2.y;
            return ret;
        }
        substract(vector2) {
            const ret = new CubismVector2(0.0, 0.0);
            ret.x = this.x - vector2.x;
            ret.y = this.y - vector2.y;
            return ret;
        }
        multiply(vector2) {
            const ret = new CubismVector2(0.0, 0.0);
            ret.x = this.x * vector2.x;
            ret.y = this.y * vector2.y;
            return ret;
        }
        multiplyByScaler(scalar) {
            return this.multiply(new CubismVector2(scalar, scalar));
        }
        division(vector2) {
            const ret = new CubismVector2(0.0, 0.0);
            ret.x = this.x / vector2.x;
            ret.y = this.y / vector2.y;
            return ret;
        }
        divisionByScalar(scalar) {
            return this.division(new CubismVector2(scalar, scalar));
        }
        getLength() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }
        getDistanceWith(a) {
            return Math.sqrt((this.x - a.x) * (this.x - a.x) + (this.y - a.y) * (this.y - a.y));
        }
        dot(a) {
            return this.x * a.x + this.y * a.y;
        }
        normalize() {
            const length = Math.pow(this.x * this.x + this.y * this.y, 0.5);
            this.x = this.x / length;
            this.y = this.y / length;
        }
        isEqual(rhs) {
            return this.x == rhs.x && this.y == rhs.y;
        }
        isNotEqual(rhs) {
            return !this.isEqual(rhs);
        }
    }
    exports.CubismVector2 = CubismVector2;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismVector2 = $.CubismVector2;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/math/cubismmath", ["require", "exports", "framework/src/math/cubismvector2", "framework/src/math/cubismmath"], function (require, exports, cubismvector2_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMath = void 0;
    class CubismMath {
        static range(value, min, max) {
            if (value < min) {
                value = min;
            }
            else if (value > max) {
                value = max;
            }
            return value;
        }
        static sin(x) {
            return Math.sin(x);
        }
        static cos(x) {
            return Math.cos(x);
        }
        static abs(x) {
            return Math.abs(x);
        }
        static sqrt(x) {
            return Math.sqrt(x);
        }
        static cbrt(x) {
            if (x === 0) {
                return x;
            }
            let cx = x;
            const isNegativeNumber = cx < 0;
            if (isNegativeNumber) {
                cx = -cx;
            }
            let ret;
            if (cx === Infinity) {
                ret = Infinity;
            }
            else {
                ret = Math.exp(Math.log(cx) / 3);
                ret = (cx / (ret * ret) + 2 * ret) / 3;
            }
            return isNegativeNumber ? -ret : ret;
        }
        static getEasingSine(value) {
            if (value < 0.0) {
                return 0.0;
            }
            else if (value > 1.0) {
                return 1.0;
            }
            return 0.5 - 0.5 * this.cos(value * Math.PI);
        }
        static max(left, right) {
            return left > right ? left : right;
        }
        static min(left, right) {
            return left > right ? right : left;
        }
        static clamp(val, min, max) {
            if (val < min) {
                return min;
            }
            else if (max < val) {
                return max;
            }
            return val;
        }
        static degreesToRadian(degrees) {
            return (degrees / 180.0) * Math.PI;
        }
        static radianToDegrees(radian) {
            return (radian * 180.0) / Math.PI;
        }
        static directionToRadian(from, to) {
            const q1 = Math.atan2(to.y, to.x);
            const q2 = Math.atan2(from.y, from.x);
            let ret = q1 - q2;
            while (ret < -Math.PI) {
                ret += Math.PI * 2.0;
            }
            while (ret > Math.PI) {
                ret -= Math.PI * 2.0;
            }
            return ret;
        }
        static directionToDegrees(from, to) {
            const radian = this.directionToRadian(from, to);
            let degree = this.radianToDegrees(radian);
            if (to.x - from.x > 0.0) {
                degree = -degree;
            }
            return degree;
        }
        static radianToDirection(totalAngle) {
            const ret = new cubismvector2_1.CubismVector2();
            ret.x = this.sin(totalAngle);
            ret.y = this.cos(totalAngle);
            return ret;
        }
        static quadraticEquation(a, b, c) {
            if (this.abs(a) < CubismMath.Epsilon) {
                if (this.abs(b) < CubismMath.Epsilon) {
                    return -c;
                }
                return -c / b;
            }
            return -(b + this.sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
        }
        static cardanoAlgorithmForBezier(a, b, c, d) {
            if (this.abs(a) < CubismMath.Epsilon) {
                return this.range(this.quadraticEquation(b, c, d), 0.0, 1.0);
            }
            const ba = b / a;
            const ca = c / a;
            const da = d / a;
            const p = (3.0 * ca - ba * ba) / 3.0;
            const p3 = p / 3.0;
            const q = (2.0 * ba * ba * ba - 9.0 * ba * ca + 27.0 * da) / 27.0;
            const q2 = q / 2.0;
            const discriminant = q2 * q2 + p3 * p3 * p3;
            const center = 0.5;
            const threshold = center + 0.01;
            if (discriminant < 0.0) {
                const mp3 = -p / 3.0;
                const mp33 = mp3 * mp3 * mp3;
                const r = this.sqrt(mp33);
                const t = -q / (2.0 * r);
                const cosphi = this.range(t, -1.0, 1.0);
                const phi = Math.acos(cosphi);
                const crtr = this.cbrt(r);
                const t1 = 2.0 * crtr;
                const root1 = t1 * this.cos(phi / 3.0) - ba / 3.0;
                if (this.abs(root1 - center) < threshold) {
                    return this.range(root1, 0.0, 1.0);
                }
                const root2 = t1 * this.cos((phi + 2.0 * Math.PI) / 3.0) - ba / 3.0;
                if (this.abs(root2 - center) < threshold) {
                    return this.range(root2, 0.0, 1.0);
                }
                const root3 = t1 * this.cos((phi + 4.0 * Math.PI) / 3.0) - ba / 3.0;
                return this.range(root3, 0.0, 1.0);
            }
            if (discriminant == 0.0) {
                let u1;
                if (q2 < 0.0) {
                    u1 = this.cbrt(-q2);
                }
                else {
                    u1 = -this.cbrt(q2);
                }
                const root1 = 2.0 * u1 - ba / 3.0;
                if (this.abs(root1 - center) < threshold) {
                    return this.range(root1, 0.0, 1.0);
                }
                const root2 = -u1 - ba / 3.0;
                return this.range(root2, 0.0, 1.0);
            }
            const sd = this.sqrt(discriminant);
            const u1 = this.cbrt(sd - q2);
            const v1 = this.cbrt(sd + q2);
            const root1 = u1 - v1 - ba / 3.0;
            return this.range(root1, 0.0, 1.0);
        }
        static mod(dividend, divisor) {
            if (!isFinite(dividend) ||
                divisor === 0 ||
                isNaN(dividend) ||
                isNaN(divisor)) {
                console.warn(`divided: ${dividend}, divisor: ${divisor} mod() returns 'NaN'.`);
                return NaN;
            }
            const absDividend = Math.abs(dividend);
            const absDivisor = Math.abs(divisor);
            let result = absDividend - Math.floor(absDividend / absDivisor) * absDivisor;
            result *= Math.sign(dividend);
            return result;
        }
        constructor() { }
    }
    exports.CubismMath = CubismMath;
    CubismMath.Epsilon = 0.00001;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMath = $.CubismMath;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/math/cubismmatrix44", ["require", "exports", "framework/src/math/cubismmath", "framework/src/math/cubismmatrix44"], function (require, exports, cubismmath_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMatrix44 = void 0;
    class CubismMatrix44 {
        constructor() {
            this._tr = new Float32Array(16);
            this.loadIdentity();
        }
        static multiply(a, b, dst) {
            const c = new Float32Array([
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0
            ]);
            const n = 4;
            for (let i = 0; i < n; ++i) {
                for (let j = 0; j < n; ++j) {
                    for (let k = 0; k < n; ++k) {
                        c[j + i * 4] += a[k + i * 4] * b[j + k * 4];
                    }
                }
            }
            for (let i = 0; i < 16; ++i) {
                dst[i] = c[i];
            }
        }
        loadIdentity() {
            const c = new Float32Array([
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
                1.0
            ]);
            this.setMatrix(c);
        }
        setMatrix(tr) {
            for (let i = 0; i < 16; ++i) {
                this._tr[i] = tr[i];
            }
        }
        getArray() {
            return this._tr;
        }
        getScaleX() {
            return this._tr[0];
        }
        getScaleY() {
            return this._tr[5];
        }
        getTranslateX() {
            return this._tr[12];
        }
        getTranslateY() {
            return this._tr[13];
        }
        transformX(src) {
            return this._tr[0] * src + this._tr[12];
        }
        transformY(src) {
            return this._tr[5] * src + this._tr[13];
        }
        invertTransformX(src) {
            return (src - this._tr[12]) / this._tr[0];
        }
        invertTransformY(src) {
            return (src - this._tr[13]) / this._tr[5];
        }
        translateRelative(x, y) {
            const tr1 = new Float32Array([
                1.0,
                0.0,
                0.0,
                0.0,
                0.0,
                1.0,
                0.0,
                0.0,
                0.0,
                0.0,
                1.0,
                0.0,
                x,
                y,
                0.0,
                1.0
            ]);
            CubismMatrix44.multiply(tr1, this._tr, this._tr);
        }
        translate(x, y) {
            this._tr[12] = x;
            this._tr[13] = y;
        }
        translateX(x) {
            this._tr[12] = x;
        }
        translateY(y) {
            this._tr[13] = y;
        }
        scaleRelative(x, y) {
            const tr1 = new Float32Array([
                x,
                0.0,
                0.0,
                0.0,
                0.0,
                y,
                0.0,
                0.0,
                0.0,
                0.0,
                1.0,
                0.0,
                0.0,
                0.0,
                0.0,
                1.0
            ]);
            CubismMatrix44.multiply(tr1, this._tr, this._tr);
        }
        scale(x, y) {
            this._tr[0] = x;
            this._tr[5] = y;
        }
        multiplyByMatrix(m) {
            CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
        }
        getInvert() {
            const r00 = this._tr[0];
            const r10 = this._tr[1];
            const r20 = this._tr[2];
            const r01 = this._tr[4];
            const r11 = this._tr[5];
            const r21 = this._tr[6];
            const r02 = this._tr[8];
            const r12 = this._tr[9];
            const r22 = this._tr[10];
            const tx = this._tr[12];
            const ty = this._tr[13];
            const tz = this._tr[14];
            const det = r00 * (r11 * r22 - r12 * r21) -
                r01 * (r10 * r22 - r12 * r20) +
                r02 * (r10 * r21 - r11 * r20);
            const dst = new CubismMatrix44();
            if (cubismmath_1.CubismMath.abs(det) < cubismmath_1.CubismMath.Epsilon) {
                dst.loadIdentity();
                return dst;
            }
            const invDet = 1.0 / det;
            const inv00 = (r11 * r22 - r12 * r21) * invDet;
            const inv01 = -(r01 * r22 - r02 * r21) * invDet;
            const inv02 = (r01 * r12 - r02 * r11) * invDet;
            const inv10 = -(r10 * r22 - r12 * r20) * invDet;
            const inv11 = (r00 * r22 - r02 * r20) * invDet;
            const inv12 = -(r00 * r12 - r02 * r10) * invDet;
            const inv20 = (r10 * r21 - r11 * r20) * invDet;
            const inv21 = -(r00 * r21 - r01 * r20) * invDet;
            const inv22 = (r00 * r11 - r01 * r10) * invDet;
            dst._tr[0] = inv00;
            dst._tr[1] = inv10;
            dst._tr[2] = inv20;
            dst._tr[3] = 0.0;
            dst._tr[4] = inv01;
            dst._tr[5] = inv11;
            dst._tr[6] = inv21;
            dst._tr[7] = 0.0;
            dst._tr[8] = inv02;
            dst._tr[9] = inv12;
            dst._tr[10] = inv22;
            dst._tr[11] = 0.0;
            dst._tr[12] = -(inv00 * tx + inv01 * ty + inv02 * tz);
            dst._tr[13] = -(inv10 * tx + inv11 * ty + inv12 * tz);
            dst._tr[14] = -(inv20 * tx + inv21 * ty + inv22 * tz);
            dst._tr[15] = 1.0;
            return dst;
        }
        clone() {
            const cloneMatrix = new CubismMatrix44();
            for (let i = 0; i < this._tr.length; i++) {
                cloneMatrix._tr[i] = this._tr[i];
            }
            return cloneMatrix;
        }
    }
    exports.CubismMatrix44 = CubismMatrix44;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMatrix44 = $.CubismMatrix44;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/cubismframeworkconfig", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CSM_LOG_LEVEL = exports.CSM_LOG_LEVEL_OFF = exports.CSM_LOG_LEVEL_ERROR = exports.CSM_LOG_LEVEL_WARNING = exports.CSM_LOG_LEVEL_INFO = exports.CSM_LOG_LEVEL_DEBUG = exports.CSM_LOG_LEVEL_VERBOSE = void 0;
    exports.CSM_LOG_LEVEL_VERBOSE = 0;
    exports.CSM_LOG_LEVEL_DEBUG = 1;
    exports.CSM_LOG_LEVEL_INFO = 2;
    exports.CSM_LOG_LEVEL_WARNING = 3;
    exports.CSM_LOG_LEVEL_ERROR = 4;
    exports.CSM_LOG_LEVEL_OFF = 5;
    exports.CSM_LOG_LEVEL = exports.CSM_LOG_LEVEL_VERBOSE;
});
define("framework/src/utils/cubismdebug", ["require", "exports", "framework/src/cubismframeworkconfig", "framework/src/live2dcubismframework", "framework/src/utils/cubismdebug"], function (require, exports, cubismframeworkconfig_1, live2dcubismframework_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismDebug = exports.CubismLogError = exports.CubismLogWarning = exports.CubismLogInfo = exports.CubismLogDebug = exports.CubismLogVerbose = exports.CSM_ASSERT = exports.CubismLogPrintIn = exports.CubismLogPrint = void 0;
    const CubismLogPrint = (level, fmt, args) => {
        CubismDebug.print(level, '[CSM]' + fmt, args);
    };
    exports.CubismLogPrint = CubismLogPrint;
    const CubismLogPrintIn = (level, fmt, args) => {
        (0, exports.CubismLogPrint)(level, fmt + '\n', args);
    };
    exports.CubismLogPrintIn = CubismLogPrintIn;
    const CSM_ASSERT = (expr) => {
        console.assert(expr);
    };
    exports.CSM_ASSERT = CSM_ASSERT;
    if (cubismframeworkconfig_1.CSM_LOG_LEVEL <= cubismframeworkconfig_1.CSM_LOG_LEVEL_VERBOSE) {
        exports.CubismLogVerbose = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Verbose, '[V]' + fmt, args);
        };
        exports.CubismLogDebug = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Debug, '[D]' + fmt, args);
        };
        exports.CubismLogInfo = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Info, '[I]' + fmt, args);
        };
        exports.CubismLogWarning = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Warning, '[W]' + fmt, args);
        };
        exports.CubismLogError = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Error, '[E]' + fmt, args);
        };
    }
    else if (cubismframeworkconfig_1.CSM_LOG_LEVEL == cubismframeworkconfig_1.CSM_LOG_LEVEL_DEBUG) {
        exports.CubismLogDebug = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Debug, '[D]' + fmt, args);
        };
        exports.CubismLogInfo = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Info, '[I]' + fmt, args);
        };
        exports.CubismLogWarning = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Warning, '[W]' + fmt, args);
        };
        exports.CubismLogError = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Error, '[E]' + fmt, args);
        };
    }
    else if (cubismframeworkconfig_1.CSM_LOG_LEVEL == cubismframeworkconfig_1.CSM_LOG_LEVEL_INFO) {
        exports.CubismLogInfo = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Info, '[I]' + fmt, args);
        };
        exports.CubismLogWarning = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Warning, '[W]' + fmt, args);
        };
        exports.CubismLogError = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Error, '[E]' + fmt, args);
        };
    }
    else if (cubismframeworkconfig_1.CSM_LOG_LEVEL == cubismframeworkconfig_1.CSM_LOG_LEVEL_WARNING) {
        exports.CubismLogWarning = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Warning, '[W]' + fmt, args);
        };
        exports.CubismLogError = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Error, '[E]' + fmt, args);
        };
    }
    else if (cubismframeworkconfig_1.CSM_LOG_LEVEL == cubismframeworkconfig_1.CSM_LOG_LEVEL_ERROR) {
        exports.CubismLogError = (fmt, ...args) => {
            (0, exports.CubismLogPrintIn)(live2dcubismframework_1.LogLevel.LogLevel_Error, '[E]' + fmt, args);
        };
    }
    class CubismDebug {
        static print(logLevel, format, args) {
            if (logLevel < live2dcubismframework_1.CubismFramework.getLoggingLevel()) {
                return;
            }
            const logPrint = live2dcubismframework_1.CubismFramework.coreLogFunction;
            if (!logPrint)
                return;
            const buffer = format.replace(/\{(\d+)\}/g, (m, k) => {
                return args[k];
            });
            logPrint(buffer);
        }
        static dumpBytes(logLevel, data, length) {
            for (let i = 0; i < length; i++) {
                if (i % 16 == 0 && i > 0)
                    this.print(logLevel, '\n');
                else if (i % 8 == 0 && i > 0)
                    this.print(logLevel, '  ');
                this.print(logLevel, '{0} ', [data[i] & 0xff]);
            }
            this.print(logLevel, '\n');
        }
        constructor() { }
    }
    exports.CubismDebug = CubismDebug;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismDebug = $.CubismDebug;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/model/cubismmodelmultiplyandscreencolor", ["require", "exports", "framework/src/rendering/cubismrenderer", "framework/src/model/cubismmodel", "framework/src/utils/cubismdebug"], function (require, exports, cubismrenderer_1, cubismmodel_1, cubismdebug_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CubismModelMultiplyAndScreenColor = exports.ColorData = void 0;
    class ColorData {
        constructor(isOverridden = false, color = new cubismrenderer_1.CubismTextureColor()) {
            this.isOverridden = isOverridden;
            this.color = color;
        }
    }
    exports.ColorData = ColorData;
    class CubismModelMultiplyAndScreenColor {
        constructor(model) {
            this._model = model;
            this._isOverriddenModelMultiplyColors = false;
            this._isOverriddenModelScreenColors = false;
            this._userPartScreenColors = [];
            this._userPartMultiplyColors = [];
            this._userDrawableScreenColors = [];
            this._userDrawableMultiplyColors = [];
            this._userOffscreenScreenColors = [];
            this._userOffscreenMultiplyColors = [];
        }
        initialize(partCount, drawableCount, offscreenCount) {
            const userMultiplyColor = new ColorData(false, new cubismrenderer_1.CubismTextureColor(1.0, 1.0, 1.0, 1.0));
            const userScreenColor = new ColorData(false, new cubismrenderer_1.CubismTextureColor(0.0, 0.0, 0.0, 1.0));
            this._userPartMultiplyColors = new Array(partCount);
            this._userPartScreenColors = new Array(partCount);
            for (let i = 0; i < partCount; i++) {
                this._userPartMultiplyColors[i] = new ColorData(userMultiplyColor.isOverridden, new cubismrenderer_1.CubismTextureColor(userMultiplyColor.color.r, userMultiplyColor.color.g, userMultiplyColor.color.b, userMultiplyColor.color.a));
                this._userPartScreenColors[i] = new ColorData(userScreenColor.isOverridden, new cubismrenderer_1.CubismTextureColor(userScreenColor.color.r, userScreenColor.color.g, userScreenColor.color.b, userScreenColor.color.a));
            }
            this._userDrawableMultiplyColors = new Array(drawableCount);
            this._userDrawableScreenColors = new Array(drawableCount);
            for (let i = 0; i < drawableCount; i++) {
                this._userDrawableMultiplyColors[i] = new ColorData(userMultiplyColor.isOverridden, new cubismrenderer_1.CubismTextureColor(userMultiplyColor.color.r, userMultiplyColor.color.g, userMultiplyColor.color.b, userMultiplyColor.color.a));
                this._userDrawableScreenColors[i] = new ColorData(userScreenColor.isOverridden, new cubismrenderer_1.CubismTextureColor(userScreenColor.color.r, userScreenColor.color.g, userScreenColor.color.b, userScreenColor.color.a));
            }
            this._userOffscreenMultiplyColors = new Array(offscreenCount);
            this._userOffscreenScreenColors = new Array(offscreenCount);
            for (let i = 0; i < offscreenCount; i++) {
                this._userOffscreenMultiplyColors[i] = new ColorData(userMultiplyColor.isOverridden, new cubismrenderer_1.CubismTextureColor(userMultiplyColor.color.r, userMultiplyColor.color.g, userMultiplyColor.color.b, userMultiplyColor.color.a));
                this._userOffscreenScreenColors[i] = new ColorData(userScreenColor.isOverridden, new cubismrenderer_1.CubismTextureColor(userScreenColor.color.r, userScreenColor.color.g, userScreenColor.color.b, userScreenColor.color.a));
            }
        }
        warnIndexOutOfRange(functionName, index, maxIndex) {
            (0, cubismdebug_1.CubismLogWarning)(`${functionName}: index is out of range. index=${index}, valid range=[0, ${maxIndex}].`);
        }
        isValidPartIndex(index, functionName) {
            if (index < 0 || index >= this._model.getPartCount()) {
                this.warnIndexOutOfRange(functionName, index, this._model.getPartCount() - 1);
                return false;
            }
            return true;
        }
        isValidDrawableIndex(index, functionName) {
            if (index < 0 || index >= this._model.getDrawableCount()) {
                this.warnIndexOutOfRange(functionName, index, this._model.getDrawableCount() - 1);
                return false;
            }
            return true;
        }
        isValidOffscreenIndex(index, functionName) {
            if (index < 0 || index >= this._model.getOffscreenCount()) {
                this.warnIndexOutOfRange(functionName, index, this._model.getOffscreenCount() - 1);
                return false;
            }
            return true;
        }
        setMultiplyColorEnabled(value) {
            this._isOverriddenModelMultiplyColors = value;
        }
        getMultiplyColorEnabled() {
            return this._isOverriddenModelMultiplyColors;
        }
        setScreenColorEnabled(value) {
            this._isOverriddenModelScreenColors = value;
        }
        getScreenColorEnabled() {
            return this._isOverriddenModelScreenColors;
        }
        setPartMultiplyColorEnabled(partIndex, value) {
            if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorEnabled')) {
                return;
            }
            this.setPartColorEnabled(partIndex, value, this._userPartMultiplyColors, this._userDrawableMultiplyColors, this._userOffscreenMultiplyColors);
        }
        getPartMultiplyColorEnabled(partIndex) {
            if (!this.isValidPartIndex(partIndex, 'getPartMultiplyColorEnabled')) {
                return false;
            }
            return this._userPartMultiplyColors[partIndex].isOverridden;
        }
        setPartScreenColorEnabled(partIndex, value) {
            if (!this.isValidPartIndex(partIndex, 'setPartScreenColorEnabled')) {
                return;
            }
            this.setPartColorEnabled(partIndex, value, this._userPartScreenColors, this._userDrawableScreenColors, this._userOffscreenScreenColors);
        }
        getPartScreenColorEnabled(partIndex) {
            if (!this.isValidPartIndex(partIndex, 'getPartScreenColorEnabled')) {
                return false;
            }
            return this._userPartScreenColors[partIndex].isOverridden;
        }
        setPartMultiplyColorByTextureColor(partIndex, color) {
            if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorByTextureColor')) {
                return;
            }
            this.setPartMultiplyColorByRGBA(partIndex, color.r, color.g, color.b, color.a);
        }
        setPartMultiplyColorByRGBA(partIndex, r, g, b, a = 1.0) {
            if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorByRGBA')) {
                return;
            }
            this.setPartColor(partIndex, r, g, b, a, this._userPartMultiplyColors, this._userDrawableMultiplyColors, this._userOffscreenMultiplyColors);
        }
        getPartMultiplyColor(partIndex) {
            if (!this.isValidPartIndex(partIndex, 'getPartMultiplyColor')) {
                return new cubismrenderer_1.CubismTextureColor(1.0, 1.0, 1.0, 1.0);
            }
            return this._userPartMultiplyColors[partIndex].color;
        }
        setPartScreenColorByTextureColor(partIndex, color) {
            if (!this.isValidPartIndex(partIndex, 'setPartScreenColorByTextureColor')) {
                return;
            }
            this.setPartScreenColorByRGBA(partIndex, color.r, color.g, color.b, color.a);
        }
        setPartScreenColorByRGBA(partIndex, r, g, b, a = 1.0) {
            if (!this.isValidPartIndex(partIndex, 'setPartScreenColorByRGBA')) {
                return;
            }
            this.setPartColor(partIndex, r, g, b, a, this._userPartScreenColors, this._userDrawableScreenColors, this._userOffscreenScreenColors);
        }
        getPartScreenColor(partIndex) {
            if (!this.isValidPartIndex(partIndex, 'getPartScreenColor')) {
                return new cubismrenderer_1.CubismTextureColor(0.0, 0.0, 0.0, 1.0);
            }
            return this._userPartScreenColors[partIndex].color;
        }
        setDrawableMultiplyColorEnabled(drawableIndex, value) {
            if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableMultiplyColorEnabled')) {
                return;
            }
            this._userDrawableMultiplyColors[drawableIndex].isOverridden = value;
        }
        getDrawableMultiplyColorEnabled(drawableIndex) {
            if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableMultiplyColorEnabled')) {
                return false;
            }
            return this._userDrawableMultiplyColors[drawableIndex].isOverridden;
        }
        setDrawableScreenColorEnabled(drawableIndex, value) {
            if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorEnabled')) {
                return;
            }
            this._userDrawableScreenColors[drawableIndex].isOverridden = value;
        }
        getDrawableScreenColorEnabled(drawableIndex) {
            if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableScreenColorEnabled')) {
                return false;
            }
            return this._userDrawableScreenColors[drawableIndex].isOverridden;
        }
        setDrawableMultiplyColorByTextureColor(drawableIndex, color) {
            if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableMultiplyColorByTextureColor')) {
                return;
            }
            this.setDrawableMultiplyColorByRGBA(drawableIndex, color.r, color.g, color.b, color.a);
        }
        setDrawableMultiplyColorByRGBA(drawableIndex, r, g, b, a = 1.0) {
            if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableMultiplyColorByRGBA')) {
                return;
            }
            this._userDrawableMultiplyColors[drawableIndex].color.r = r;
            this._userDrawableMultiplyColors[drawableIndex].color.g = g;
            this._userDrawableMultiplyColors[drawableIndex].color.b = b;
            this._userDrawableMultiplyColors[drawableIndex].color.a = a;
        }
        getDrawableMultiplyColor(drawableIndex) {
            if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableMultiplyColor')) {
                return new cubismrenderer_1.CubismTextureColor(1.0, 1.0, 1.0, 1.0);
            }
            if (this.getMultiplyColorEnabled() ||
                this.getDrawableMultiplyColorEnabled(drawableIndex)) {
                return this._userDrawableMultiplyColors[drawableIndex].color;
            }
            return this._model.getDrawableMultiplyColor(drawableIndex);
        }
        setDrawableScreenColorByTextureColor(drawableIndex, color) {
            if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorByTextureColor')) {
                return;
            }
            this.setDrawableScreenColorByRGBA(drawableIndex, color.r, color.g, color.b, color.a);
        }
        setDrawableScreenColorByRGBA(drawableIndex, r, g, b, a = 1.0) {
            if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorByRGBA')) {
                return;
            }
            this._userDrawableScreenColors[drawableIndex].color.r = r;
            this._userDrawableScreenColors[drawableIndex].color.g = g;
            this._userDrawableScreenColors[drawableIndex].color.b = b;
            this._userDrawableScreenColors[drawableIndex].color.a = a;
        }
        getDrawableScreenColor(drawableIndex) {
            if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableScreenColor')) {
                return new cubismrenderer_1.CubismTextureColor(0.0, 0.0, 0.0, 1.0);
            }
            if (this.getScreenColorEnabled() ||
                this.getDrawableScreenColorEnabled(drawableIndex)) {
                return this._userDrawableScreenColors[drawableIndex].color;
            }
            return this._model.getDrawableScreenColor(drawableIndex);
        }
        setOffscreenMultiplyColorEnabled(offscreenIndex, value) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenMultiplyColorEnabled')) {
                return;
            }
            this._userOffscreenMultiplyColors[offscreenIndex].isOverridden = value;
        }
        getOffscreenMultiplyColorEnabled(offscreenIndex) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenMultiplyColorEnabled')) {
                return false;
            }
            return this._userOffscreenMultiplyColors[offscreenIndex].isOverridden;
        }
        setOffscreenScreenColorEnabled(offscreenIndex, value) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenScreenColorEnabled')) {
                return;
            }
            this._userOffscreenScreenColors[offscreenIndex].isOverridden = value;
        }
        getOffscreenScreenColorEnabled(offscreenIndex) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenScreenColorEnabled')) {
                return false;
            }
            return this._userOffscreenScreenColors[offscreenIndex].isOverridden;
        }
        setOffscreenMultiplyColorByTextureColor(offscreenIndex, color) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenMultiplyColorByTextureColor')) {
                return;
            }
            this.setOffscreenMultiplyColorByRGBA(offscreenIndex, color.r, color.g, color.b, color.a);
        }
        setOffscreenMultiplyColorByRGBA(offscreenIndex, r, g, b, a = 1.0) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenMultiplyColorByRGBA')) {
                return;
            }
            this._userOffscreenMultiplyColors[offscreenIndex].color.r = r;
            this._userOffscreenMultiplyColors[offscreenIndex].color.g = g;
            this._userOffscreenMultiplyColors[offscreenIndex].color.b = b;
            this._userOffscreenMultiplyColors[offscreenIndex].color.a = a;
        }
        getOffscreenMultiplyColor(offscreenIndex) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenMultiplyColor')) {
                return new cubismrenderer_1.CubismTextureColor(1.0, 1.0, 1.0, 1.0);
            }
            if (this.getMultiplyColorEnabled() ||
                this.getOffscreenMultiplyColorEnabled(offscreenIndex)) {
                return this._userOffscreenMultiplyColors[offscreenIndex].color;
            }
            return this._model.getOffscreenMultiplyColor(offscreenIndex);
        }
        setOffscreenScreenColorByTextureColor(offscreenIndex, color) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenScreenColorByTextureColor')) {
                return;
            }
            this.setOffscreenScreenColorByRGBA(offscreenIndex, color.r, color.g, color.b, color.a);
        }
        setOffscreenScreenColorByRGBA(offscreenIndex, r, g, b, a = 1.0) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenScreenColorByRGBA')) {
                return;
            }
            this._userOffscreenScreenColors[offscreenIndex].color.r = r;
            this._userOffscreenScreenColors[offscreenIndex].color.g = g;
            this._userOffscreenScreenColors[offscreenIndex].color.b = b;
            this._userOffscreenScreenColors[offscreenIndex].color.a = a;
        }
        getOffscreenScreenColor(offscreenIndex) {
            if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenScreenColor')) {
                return new cubismrenderer_1.CubismTextureColor(0.0, 0.0, 0.0, 1.0);
            }
            if (this.getScreenColorEnabled() ||
                this.getOffscreenScreenColorEnabled(offscreenIndex)) {
                return this._userOffscreenScreenColors[offscreenIndex].color;
            }
            return this._model.getOffscreenScreenColor(offscreenIndex);
        }
        setPartColor(partIndex, r, g, b, a, partColors, drawableColors, offscreenColors) {
            partColors[partIndex].color.r = r;
            partColors[partIndex].color.g = g;
            partColors[partIndex].color.b = b;
            partColors[partIndex].color.a = a;
            if (partColors[partIndex].isOverridden) {
                const offscreenIndices = this._model.getPartOffscreenIndices();
                const offscreenIndex = offscreenIndices[partIndex];
                if (offscreenIndex == cubismmodel_1.NoOffscreenIndex) {
                    const partsHierarchy = this._model.getPartsHierarchy();
                    if (partsHierarchy && partsHierarchy[partIndex]) {
                        for (let i = 0; i < partsHierarchy[partIndex].objects.length; ++i) {
                            const objectInfo = partsHierarchy[partIndex].objects[i];
                            if (objectInfo.objectType ===
                                cubismmodel_1.CubismModelObjectType.CubismModelObjectType_Drawable) {
                                const drawableIndex = objectInfo.objectIndex;
                                drawableColors[drawableIndex].color.r = r;
                                drawableColors[drawableIndex].color.g = g;
                                drawableColors[drawableIndex].color.b = b;
                                drawableColors[drawableIndex].color.a = a;
                            }
                            else {
                                const childPartIndex = objectInfo.objectIndex;
                                this.setPartColor(childPartIndex, r, g, b, a, partColors, drawableColors, offscreenColors);
                            }
                        }
                    }
                }
                else {
                    offscreenColors[offscreenIndex].color.r = r;
                    offscreenColors[offscreenIndex].color.g = g;
                    offscreenColors[offscreenIndex].color.b = b;
                    offscreenColors[offscreenIndex].color.a = a;
                }
            }
        }
        setPartColorEnabled(partIndex, value, partColors, drawableColors, offscreenColors) {
            partColors[partIndex].isOverridden = value;
            const offscreenIndices = this._model.getPartOffscreenIndices();
            const offscreenIndex = offscreenIndices[partIndex];
            if (offscreenIndex == cubismmodel_1.NoOffscreenIndex) {
                const partsHierarchy = this._model.getPartsHierarchy();
                if (partsHierarchy && partsHierarchy[partIndex]) {
                    for (let i = 0; i < partsHierarchy[partIndex].objects.length; ++i) {
                        const objectInfo = partsHierarchy[partIndex].objects[i];
                        if (objectInfo.objectType ===
                            cubismmodel_1.CubismModelObjectType.CubismModelObjectType_Drawable) {
                            const drawableIndex = objectInfo.objectIndex;
                            drawableColors[drawableIndex].isOverridden = value;
                            if (value) {
                                drawableColors[drawableIndex].color.r =
                                    partColors[partIndex].color.r;
                                drawableColors[drawableIndex].color.g =
                                    partColors[partIndex].color.g;
                                drawableColors[drawableIndex].color.b =
                                    partColors[partIndex].color.b;
                                drawableColors[drawableIndex].color.a =
                                    partColors[partIndex].color.a;
                            }
                        }
                        else {
                            const childPartIndex = objectInfo.objectIndex;
                            if (value) {
                                partColors[childPartIndex].color.r =
                                    partColors[partIndex].color.r;
                                partColors[childPartIndex].color.g =
                                    partColors[partIndex].color.g;
                                partColors[childPartIndex].color.b =
                                    partColors[partIndex].color.b;
                                partColors[childPartIndex].color.a =
                                    partColors[partIndex].color.a;
                            }
                            this.setPartColorEnabled(childPartIndex, value, partColors, drawableColors, offscreenColors);
                        }
                    }
                }
            }
            else {
                offscreenColors[offscreenIndex].isOverridden = value;
                if (value) {
                    offscreenColors[offscreenIndex].color.r = partColors[partIndex].color.r;
                    offscreenColors[offscreenIndex].color.g = partColors[partIndex].color.g;
                    offscreenColors[offscreenIndex].color.b = partColors[partIndex].color.b;
                    offscreenColors[offscreenIndex].color.a = partColors[partIndex].color.a;
                }
            }
        }
    }
    exports.CubismModelMultiplyAndScreenColor = CubismModelMultiplyAndScreenColor;
});
define("framework/src/model/cubismmodel", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/math/cubismmath", "framework/src/rendering/cubismrenderer", "framework/src/utils/cubismdebug", "framework/src/model/cubismmodelmultiplyandscreencolor", "framework/src/model/cubismmodel"], function (require, exports, live2dcubismframework_2, cubismmath_2, cubismrenderer_2, cubismdebug_2, cubismmodelmultiplyandscreencolor_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismModel = exports.CubismModelPartInfo = exports.CubismModelObjectInfo = exports.PartChildDrawObjects = exports.CullingData = exports.DrawableCullingData = exports.ParameterRepeatData = exports.CubismModelObjectType = exports.CubismAlphaBlend = exports.CubismColorBlend = exports.NoOffscreenIndex = exports.NoParentIndex = void 0;
    exports.NoParentIndex = -1;
    exports.NoOffscreenIndex = -1;
    var CubismColorBlend;
    (function (CubismColorBlend) {
        CubismColorBlend[CubismColorBlend["ColorBlend_None"] = -1] = "ColorBlend_None";
        CubismColorBlend[CubismColorBlend["ColorBlend_Normal"] = Live2DCubismCore.ColorBlendType_Normal] = "ColorBlend_Normal";
        CubismColorBlend[CubismColorBlend["ColorBlend_AddGlow"] = Live2DCubismCore.ColorBlendType_AddGlow] = "ColorBlend_AddGlow";
        CubismColorBlend[CubismColorBlend["ColorBlend_Add"] = Live2DCubismCore.ColorBlendType_Add] = "ColorBlend_Add";
        CubismColorBlend[CubismColorBlend["ColorBlend_Darken"] = Live2DCubismCore.ColorBlendType_Darken] = "ColorBlend_Darken";
        CubismColorBlend[CubismColorBlend["ColorBlend_Multiply"] = Live2DCubismCore.ColorBlendType_Multiply] = "ColorBlend_Multiply";
        CubismColorBlend[CubismColorBlend["ColorBlend_ColorBurn"] = Live2DCubismCore.ColorBlendType_ColorBurn] = "ColorBlend_ColorBurn";
        CubismColorBlend[CubismColorBlend["ColorBlend_LinearBurn"] = Live2DCubismCore.ColorBlendType_LinearBurn] = "ColorBlend_LinearBurn";
        CubismColorBlend[CubismColorBlend["ColorBlend_Lighten"] = Live2DCubismCore.ColorBlendType_Lighten] = "ColorBlend_Lighten";
        CubismColorBlend[CubismColorBlend["ColorBlend_Screen"] = Live2DCubismCore.ColorBlendType_Screen] = "ColorBlend_Screen";
        CubismColorBlend[CubismColorBlend["ColorBlend_ColorDodge"] = Live2DCubismCore.ColorBlendType_ColorDodge] = "ColorBlend_ColorDodge";
        CubismColorBlend[CubismColorBlend["ColorBlend_Overlay"] = Live2DCubismCore.ColorBlendType_Overlay] = "ColorBlend_Overlay";
        CubismColorBlend[CubismColorBlend["ColorBlend_SoftLight"] = Live2DCubismCore.ColorBlendType_SoftLight] = "ColorBlend_SoftLight";
        CubismColorBlend[CubismColorBlend["ColorBlend_HardLight"] = Live2DCubismCore.ColorBlendType_HardLight] = "ColorBlend_HardLight";
        CubismColorBlend[CubismColorBlend["ColorBlend_LinearLight"] = Live2DCubismCore.ColorBlendType_LinearLight] = "ColorBlend_LinearLight";
        CubismColorBlend[CubismColorBlend["ColorBlend_Hue"] = Live2DCubismCore.ColorBlendType_Hue] = "ColorBlend_Hue";
        CubismColorBlend[CubismColorBlend["ColorBlend_Color"] = Live2DCubismCore.ColorBlendType_Color] = "ColorBlend_Color";
        CubismColorBlend[CubismColorBlend["ColorBlend_AddCompatible"] = Live2DCubismCore.ColorBlendType_AddCompatible] = "ColorBlend_AddCompatible";
        CubismColorBlend[CubismColorBlend["ColorBlend_MultiplyCompatible"] = Live2DCubismCore.ColorBlendType_MultiplyCompatible] = "ColorBlend_MultiplyCompatible";
    })(CubismColorBlend || (exports.CubismColorBlend = CubismColorBlend = {}));
    var CubismAlphaBlend;
    (function (CubismAlphaBlend) {
        CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_None"] = -1] = "AlphaBlend_None";
        CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Over"] = 0] = "AlphaBlend_Over";
        CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Atop"] = 1] = "AlphaBlend_Atop";
        CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Out"] = 2] = "AlphaBlend_Out";
        CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_ConjointOver"] = 3] = "AlphaBlend_ConjointOver";
        CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_DisjointOver"] = 4] = "AlphaBlend_DisjointOver";
    })(CubismAlphaBlend || (exports.CubismAlphaBlend = CubismAlphaBlend = {}));
    var CubismModelObjectType;
    (function (CubismModelObjectType) {
        CubismModelObjectType[CubismModelObjectType["CubismModelObjectType_Drawable"] = 0] = "CubismModelObjectType_Drawable";
        CubismModelObjectType[CubismModelObjectType["CubismModelObjectType_Parts"] = 1] = "CubismModelObjectType_Parts";
    })(CubismModelObjectType || (exports.CubismModelObjectType = CubismModelObjectType = {}));
    class ParameterRepeatData {
        constructor(isOverridden = false, isParameterRepeated = false) {
            this.isOverridden = isOverridden;
            this.isParameterRepeated = isParameterRepeated;
        }
    }
    exports.ParameterRepeatData = ParameterRepeatData;
    class DrawableCullingData {
        constructor(isOverridden = false, isCulling = false) {
            this.isOverridden = isOverridden;
            this.isCulling = isCulling;
        }
        get isOverwritten() {
            return this.isOverridden;
        }
    }
    exports.DrawableCullingData = DrawableCullingData;
    class CullingData {
        constructor(isOverridden = false, isCulling = false) {
            this.isOverridden = isOverridden;
            this.isCulling = isCulling;
        }
    }
    exports.CullingData = CullingData;
    class PartChildDrawObjects {
        constructor(drawableIndices = new Array(), offscreenIndices = new Array()) {
            this.drawableIndices = drawableIndices;
            this.offscreenIndices = offscreenIndices;
        }
    }
    exports.PartChildDrawObjects = PartChildDrawObjects;
    class CubismModelObjectInfo {
        constructor(objectIndex, objectType) {
            this.objectIndex = objectIndex;
            this.objectType = objectType;
        }
    }
    exports.CubismModelObjectInfo = CubismModelObjectInfo;
    class CubismModelPartInfo {
        constructor(objects = new Array(), childDrawObjects = new PartChildDrawObjects()) {
            this.objects = objects;
            this.childDrawObjects = childDrawObjects;
        }
        getChildObjectCount() {
            return this.objects.length;
        }
    }
    exports.CubismModelPartInfo = CubismModelPartInfo;
    class CubismModel {
        update() {
            this._model.update();
            this._model.drawables.resetDynamicFlags();
        }
        getPixelsPerUnit() {
            if (this._model == null) {
                return 0.0;
            }
            return this._model.canvasinfo.PixelsPerUnit;
        }
        getCanvasWidth() {
            if (this._model == null) {
                return 0.0;
            }
            return (this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit);
        }
        getCanvasHeight() {
            if (this._model == null) {
                return 0.0;
            }
            return (this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit);
        }
        saveParameters() {
            const parameterCount = this._model.parameters.count;
            const savedParameterCount = this._savedParameters.length;
            for (let i = 0; i < parameterCount; ++i) {
                if (i < savedParameterCount) {
                    this._savedParameters[i] = this._parameterValues[i];
                }
                else {
                    this._savedParameters.push(this._parameterValues[i]);
                }
            }
        }
        getOverrideMultiplyAndScreenColor() {
            return this._overrideMultiplyAndScreenColor;
        }
        getOverrideFlagForModelParameterRepeat() {
            return this._isOverriddenParameterRepeat;
        }
        setOverrideFlagForModelParameterRepeat(isRepeat) {
            this._isOverriddenParameterRepeat = isRepeat;
        }
        getOverrideFlagForParameterRepeat(parameterIndex) {
            return this._userParameterRepeatDataList[parameterIndex].isOverridden;
        }
        setOverrideFlagForParameterRepeat(parameterIndex, value) {
            this._userParameterRepeatDataList[parameterIndex].isOverridden = value;
        }
        getRepeatFlagForParameterRepeat(parameterIndex) {
            return this._userParameterRepeatDataList[parameterIndex]
                .isParameterRepeated;
        }
        setRepeatFlagForParameterRepeat(parameterIndex, value) {
            this._userParameterRepeatDataList[parameterIndex].isParameterRepeated =
                value;
        }
        getDrawableCulling(drawableIndex) {
            if (this.getOverrideFlagForModelCullings() ||
                this.getOverrideFlagForDrawableCullings(drawableIndex)) {
                return this._userDrawableCullings[drawableIndex].isCulling;
            }
            const constantFlags = this._model.drawables.constantFlags;
            return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(constantFlags[drawableIndex]);
        }
        setDrawableCulling(drawableIndex, isCulling) {
            this._userDrawableCullings[drawableIndex].isCulling = isCulling;
        }
        getOffscreenCulling(offscreenIndex) {
            if (this.getOverrideFlagForModelCullings() ||
                this.getOverrideFlagForOffscreenCullings(offscreenIndex)) {
                return this._userOffscreenCullings[offscreenIndex].isCulling;
            }
            const constantFlags = this._model.offscreens.constantFlags;
            return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(constantFlags[offscreenIndex]);
        }
        setOffscreenCulling(offscreenIndex, isCulling) {
            this._userOffscreenCullings[offscreenIndex].isCulling = isCulling;
        }
        getOverrideFlagForModelCullings() {
            return this._isOverriddenCullings;
        }
        setOverrideFlagForModelCullings(isOverriddenCullings) {
            this._isOverriddenCullings = isOverriddenCullings;
        }
        getOverrideFlagForDrawableCullings(drawableIndex) {
            return this._userDrawableCullings[drawableIndex].isOverridden;
        }
        getOverrideFlagForOffscreenCullings(offscreenIndex) {
            return this._userOffscreenCullings[offscreenIndex].isOverridden;
        }
        setOverrideFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
            this._userDrawableCullings[drawableIndex].isOverridden =
                isOverriddenCullings;
        }
        getModelOapcity() {
            return this._modelOpacity;
        }
        setModelOapcity(value) {
            this._modelOpacity = value;
        }
        getModel() {
            return this._model;
        }
        getPartIndex(partId) {
            let partIndex;
            const partCount = this._model.parts.count;
            for (partIndex = 0; partIndex < partCount; ++partIndex) {
                if (partId == this._partIds[partIndex]) {
                    return partIndex;
                }
            }
            if (this._notExistPartId.has(partId)) {
                return this._notExistPartId.get(partId);
            }
            partIndex = partCount + this._notExistPartId.size;
            this._notExistPartId.set(partId, partIndex);
            this._notExistPartOpacities.set(partIndex, null);
            return partIndex;
        }
        getPartId(partIndex) {
            const partId = this._model.parts.ids[partIndex];
            return live2dcubismframework_2.CubismFramework.getIdManager().getId(partId);
        }
        getPartCount() {
            const partCount = this._model.parts.count;
            return partCount;
        }
        getPartOffscreenIndices() {
            const offscreenIndices = this._model.parts.offscreenIndices;
            return offscreenIndices;
        }
        getPartParentPartIndices() {
            const parentIndices = this._model.parts.parentIndices;
            return parentIndices;
        }
        setPartOpacityByIndex(partIndex, opacity) {
            if (this._notExistPartOpacities.has(partIndex)) {
                this._notExistPartOpacities.set(partIndex, opacity);
                return;
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= partIndex && partIndex < this.getPartCount());
            this._partOpacities[partIndex] = opacity;
        }
        setPartOpacityById(partId, opacity) {
            const index = this.getPartIndex(partId);
            if (index < 0) {
                return;
            }
            this.setPartOpacityByIndex(index, opacity);
        }
        getPartOpacityByIndex(partIndex) {
            if (this._notExistPartOpacities.has(partIndex)) {
                return this._notExistPartOpacities.get(partIndex);
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= partIndex && partIndex < this.getPartCount());
            return this._partOpacities[partIndex];
        }
        getPartOpacityById(partId) {
            const index = this.getPartIndex(partId);
            if (index < 0) {
                return 0;
            }
            return this.getPartOpacityByIndex(index);
        }
        getParameterIndex(parameterId) {
            let parameterIndex;
            const idCount = this._model.parameters.count;
            for (parameterIndex = 0; parameterIndex < idCount; ++parameterIndex) {
                if (parameterId != this._parameterIds[parameterIndex]) {
                    continue;
                }
                return parameterIndex;
            }
            if (this._notExistParameterId.has(parameterId)) {
                return this._notExistParameterId.get(parameterId);
            }
            parameterIndex =
                this._model.parameters.count + this._notExistParameterId.size;
            this._notExistParameterId.set(parameterId, parameterIndex);
            this._notExistParameterValues.set(parameterIndex, null);
            return parameterIndex;
        }
        getParameterCount() {
            return this._model.parameters.count;
        }
        getParameterType(parameterIndex) {
            return this._model.parameters.types[parameterIndex];
        }
        getParameterMaximumValue(parameterIndex) {
            return this._model.parameters.maximumValues[parameterIndex];
        }
        getParameterMinimumValue(parameterIndex) {
            return this._model.parameters.minimumValues[parameterIndex];
        }
        getParameterDefaultValue(parameterIndex) {
            return this._model.parameters.defaultValues[parameterIndex];
        }
        getParameterId(parameterIndex) {
            return live2dcubismframework_2.CubismFramework.getIdManager().getId(this._model.parameters.ids[parameterIndex]);
        }
        getParameterValueByIndex(parameterIndex) {
            if (this._notExistParameterValues.has(parameterIndex)) {
                return this._notExistParameterValues.get(parameterIndex);
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= parameterIndex && parameterIndex < this.getParameterCount());
            return this._parameterValues[parameterIndex];
        }
        getParameterValueById(parameterId) {
            const parameterIndex = this.getParameterIndex(parameterId);
            return this.getParameterValueByIndex(parameterIndex);
        }
        setParameterValueByIndex(parameterIndex, value, weight = 1.0) {
            if (this._notExistParameterValues.has(parameterIndex)) {
                this._notExistParameterValues.set(parameterIndex, weight == 1
                    ? value
                    : this._notExistParameterValues.get(parameterIndex) * (1 - weight) +
                        value * weight);
                return;
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= parameterIndex && parameterIndex < this.getParameterCount());
            if (this.isRepeat(parameterIndex)) {
                value = this.getParameterRepeatValue(parameterIndex, value);
            }
            else {
                value = this.getParameterClampValue(parameterIndex, value);
            }
            this._parameterValues[parameterIndex] =
                weight == 1
                    ? value
                    : (this._parameterValues[parameterIndex] =
                        this._parameterValues[parameterIndex] * (1 - weight) +
                            value * weight);
        }
        setParameterValueById(parameterId, value, weight = 1.0) {
            const index = this.getParameterIndex(parameterId);
            this.setParameterValueByIndex(index, value, weight);
        }
        addParameterValueByIndex(parameterIndex, value, weight = 1.0) {
            this.setParameterValueByIndex(parameterIndex, this.getParameterValueByIndex(parameterIndex) + value * weight);
        }
        addParameterValueById(parameterId, value, weight = 1.0) {
            const index = this.getParameterIndex(parameterId);
            this.addParameterValueByIndex(index, value, weight);
        }
        isRepeat(parameterIndex) {
            if (this._notExistParameterValues.has(parameterIndex)) {
                return false;
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= parameterIndex && parameterIndex < this.getParameterCount());
            let isRepeat;
            if (this._isOverriddenParameterRepeat ||
                this._userParameterRepeatDataList[parameterIndex].isOverridden) {
                isRepeat =
                    this._userParameterRepeatDataList[parameterIndex].isParameterRepeated;
            }
            else {
                isRepeat = this._model.parameters.repeats[parameterIndex] != 0;
            }
            return isRepeat;
        }
        getParameterRepeatValue(parameterIndex, value) {
            if (this._notExistParameterValues.has(parameterIndex)) {
                return value;
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= parameterIndex && parameterIndex < this.getParameterCount());
            const maxValue = this._model.parameters.maximumValues[parameterIndex];
            const minValue = this._model.parameters.minimumValues[parameterIndex];
            const valueSize = maxValue - minValue;
            if (maxValue < value) {
                const overValue = cubismmath_2.CubismMath.mod(value - maxValue, valueSize);
                if (!Number.isNaN(overValue)) {
                    value = minValue + overValue;
                }
                else {
                    value = maxValue;
                }
            }
            if (value < minValue) {
                const overValue = cubismmath_2.CubismMath.mod(minValue - value, valueSize);
                if (!Number.isNaN(overValue)) {
                    value = maxValue - overValue;
                }
                else {
                    value = minValue;
                }
            }
            return value;
        }
        getParameterClampValue(parameterIndex, value) {
            if (this._notExistParameterValues.has(parameterIndex)) {
                return value;
            }
            (0, cubismdebug_2.CSM_ASSERT)(0 <= parameterIndex && parameterIndex < this.getParameterCount());
            const maxValue = this._model.parameters.maximumValues[parameterIndex];
            const minValue = this._model.parameters.minimumValues[parameterIndex];
            return cubismmath_2.CubismMath.clamp(value, minValue, maxValue);
        }
        getParameterRepeats(parameterIndex) {
            return this._model.parameters.repeats[parameterIndex] != 0;
        }
        multiplyParameterValueById(parameterId, value, weight = 1.0) {
            const index = this.getParameterIndex(parameterId);
            this.multiplyParameterValueByIndex(index, value, weight);
        }
        multiplyParameterValueByIndex(parameterIndex, value, weight = 1.0) {
            this.setParameterValueByIndex(parameterIndex, this.getParameterValueByIndex(parameterIndex) *
                (1.0 + (value - 1.0) * weight));
        }
        getDrawableIndex(drawableId) {
            const drawableCount = this._model.drawables.count;
            for (let drawableIndex = 0; drawableIndex < drawableCount; ++drawableIndex) {
                if (this._drawableIds[drawableIndex] == drawableId) {
                    return drawableIndex;
                }
            }
            return -1;
        }
        getDrawableCount() {
            const drawableCount = this._model.drawables.count;
            return drawableCount;
        }
        getDrawableId(drawableIndex) {
            const parameterIds = this._model.drawables.ids;
            return live2dcubismframework_2.CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
        }
        getRenderOrders() {
            const renderOrders = this._model.getRenderOrders();
            return renderOrders;
        }
        getDrawableTextureIndex(drawableIndex) {
            const textureIndices = this._model.drawables.textureIndices;
            return textureIndices[drawableIndex];
        }
        getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex) {
            const dynamicFlags = this._model.drawables.dynamicFlags;
            return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(dynamicFlags[drawableIndex]);
        }
        getDrawableVertexIndexCount(drawableIndex) {
            const indexCounts = this._model.drawables.indexCounts;
            return indexCounts[drawableIndex];
        }
        getDrawableVertexCount(drawableIndex) {
            const vertexCounts = this._model.drawables.vertexCounts;
            return vertexCounts[drawableIndex];
        }
        getDrawableVertices(drawableIndex) {
            return this.getDrawableVertexPositions(drawableIndex);
        }
        getDrawableVertexIndices(drawableIndex) {
            const indicesArray = this._model.drawables.indices;
            return indicesArray[drawableIndex];
        }
        getDrawableVertexPositions(drawableIndex) {
            const verticesArray = this._model.drawables.vertexPositions;
            return verticesArray[drawableIndex];
        }
        getDrawableVertexUvs(drawableIndex) {
            const uvsArray = this._model.drawables.vertexUvs;
            return uvsArray[drawableIndex];
        }
        getDrawableOpacity(drawableIndex) {
            const opacities = this._model.drawables.opacities;
            return opacities[drawableIndex];
        }
        getDrawableMultiplyColor(drawableIndex) {
            if (this._drawableMultiplyColors == null) {
                this._drawableMultiplyColors = new Array(this._model.drawables.count);
                this._drawableMultiplyColors.fill(new cubismrenderer_2.CubismTextureColor());
            }
            const multiplyColors = this._model.drawables.multiplyColors;
            const index = drawableIndex * 4;
            this._drawableMultiplyColors[drawableIndex].r = multiplyColors[index];
            this._drawableMultiplyColors[drawableIndex].g = multiplyColors[index + 1];
            this._drawableMultiplyColors[drawableIndex].b = multiplyColors[index + 2];
            this._drawableMultiplyColors[drawableIndex].a = multiplyColors[index + 3];
            return this._drawableMultiplyColors[drawableIndex];
        }
        getDrawableScreenColor(drawableIndex) {
            if (this._drawableScreenColors == null) {
                this._drawableScreenColors = new Array(this._model.drawables.count);
                this._drawableScreenColors.fill(new cubismrenderer_2.CubismTextureColor());
            }
            const screenColors = this._model.drawables.screenColors;
            const index = drawableIndex * 4;
            this._drawableScreenColors[drawableIndex].r = screenColors[index];
            this._drawableScreenColors[drawableIndex].g = screenColors[index + 1];
            this._drawableScreenColors[drawableIndex].b = screenColors[index + 2];
            this._drawableScreenColors[drawableIndex].a = screenColors[index + 3];
            return this._drawableScreenColors[drawableIndex];
        }
        getOffscreenMultiplyColor(offscreenIndex) {
            if (this._offscreenMultiplyColors == null) {
                this._offscreenMultiplyColors = new Array(this._model.offscreens.count);
                this._offscreenMultiplyColors.fill(new cubismrenderer_2.CubismTextureColor());
            }
            const multiplyColors = this._model.offscreens.multiplyColors;
            const index = offscreenIndex * 4;
            this._offscreenMultiplyColors[offscreenIndex].r = multiplyColors[index];
            this._offscreenMultiplyColors[offscreenIndex].g = multiplyColors[index + 1];
            this._offscreenMultiplyColors[offscreenIndex].b = multiplyColors[index + 2];
            this._offscreenMultiplyColors[offscreenIndex].a = multiplyColors[index + 3];
            return this._offscreenMultiplyColors[offscreenIndex];
        }
        getOffscreenScreenColor(offscreenIndex) {
            if (this._offscreenScreenColors == null) {
                this._offscreenScreenColors = new Array(this._model.offscreens.count);
                this._offscreenScreenColors.fill(new cubismrenderer_2.CubismTextureColor());
            }
            const screenColors = this._model.offscreens.screenColors;
            const index = offscreenIndex * 4;
            this._offscreenScreenColors[offscreenIndex].r = screenColors[index];
            this._offscreenScreenColors[offscreenIndex].g = screenColors[index + 1];
            this._offscreenScreenColors[offscreenIndex].b = screenColors[index + 2];
            this._offscreenScreenColors[offscreenIndex].a = screenColors[index + 3];
            return this._offscreenScreenColors[offscreenIndex];
        }
        getDrawableParentPartIndex(drawableIndex) {
            return this._model.drawables.parentPartIndices[drawableIndex];
        }
        getDrawableBlendMode(drawableIndex) {
            const constantFlags = this._model.drawables.constantFlags;
            return Live2DCubismCore.Utils.hasBlendAdditiveBit(constantFlags[drawableIndex])
                ? cubismrenderer_2.CubismBlendMode.CubismBlendMode_Additive
                : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(constantFlags[drawableIndex])
                    ? cubismrenderer_2.CubismBlendMode.CubismBlendMode_Multiplicative
                    : cubismrenderer_2.CubismBlendMode.CubismBlendMode_Normal;
        }
        getDrawableColorBlend(drawableIndex) {
            if (this._drawableColorBlends[drawableIndex] ==
                CubismColorBlend.ColorBlend_None) {
                this._drawableColorBlends[drawableIndex] =
                    this._model.drawables.blendModes[drawableIndex] & 0xff;
            }
            return this._drawableColorBlends[drawableIndex];
        }
        getDrawableAlphaBlend(drawableIndex) {
            if (this._drawableAlphaBlends[drawableIndex] ==
                CubismAlphaBlend.AlphaBlend_None) {
                this._drawableAlphaBlends[drawableIndex] =
                    (this._model.drawables.blendModes[drawableIndex] >> 8) & 0xff;
            }
            return this._drawableAlphaBlends[drawableIndex];
        }
        getDrawableInvertedMaskBit(drawableIndex) {
            const constantFlags = this._model.drawables.constantFlags;
            return Live2DCubismCore.Utils.hasIsInvertedMaskBit(constantFlags[drawableIndex]);
        }
        getDrawableMasks() {
            const masks = this._model.drawables.masks;
            return masks;
        }
        getDrawableMaskCounts() {
            const maskCounts = this._model.drawables.maskCounts;
            return maskCounts;
        }
        isUsingMasking() {
            for (let d = 0; d < this._model.drawables.count; ++d) {
                if (this._model.drawables.maskCounts[d] <= 0) {
                    continue;
                }
                return true;
            }
            return false;
        }
        isUsingMaskingForOffscreen() {
            for (let d = 0; d < this.getOffscreenCount(); ++d) {
                if (this._model.offscreens.maskCounts[d] <= 0) {
                    continue;
                }
                return true;
            }
            return false;
        }
        getDrawableDynamicFlagIsVisible(drawableIndex) {
            const dynamicFlags = this._model.drawables.dynamicFlags;
            return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
        }
        getDrawableDynamicFlagVisibilityDidChange(drawableIndex) {
            const dynamicFlags = this._model.drawables.dynamicFlags;
            return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(dynamicFlags[drawableIndex]);
        }
        getDrawableDynamicFlagOpacityDidChange(drawableIndex) {
            const dynamicFlags = this._model.drawables.dynamicFlags;
            return Live2DCubismCore.Utils.hasOpacityDidChangeBit(dynamicFlags[drawableIndex]);
        }
        getDrawableDynamicFlagRenderOrderDidChange(drawableIndex) {
            const dynamicFlags = this._model.drawables.dynamicFlags;
            return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(dynamicFlags[drawableIndex]);
        }
        getDrawableDynamicFlagBlendColorDidChange(drawableIndex) {
            const dynamicFlags = this._model.drawables.dynamicFlags;
            return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(dynamicFlags[drawableIndex]);
        }
        getOffscreenCount() {
            return this._model.offscreens.count;
        }
        getOffscreenColorBlend(offscreenIndex) {
            if (this._offscreenColorBlends[offscreenIndex] ==
                CubismColorBlend.ColorBlend_None) {
                this._offscreenColorBlends[offscreenIndex] =
                    this._model.offscreens.blendModes[offscreenIndex] & 0xff;
            }
            return this._offscreenColorBlends[offscreenIndex];
        }
        getOffscreenAlphaBlend(offscreenIndex) {
            if (this._offscreenAlphaBlends[offscreenIndex] ==
                CubismAlphaBlend.AlphaBlend_None) {
                this._offscreenAlphaBlends[offscreenIndex] =
                    (this._model.offscreens.blendModes[offscreenIndex] >> 8) & 0xff;
            }
            return this._offscreenAlphaBlends[offscreenIndex];
        }
        getOffscreenOwnerIndices() {
            return this._model.offscreens.ownerIndices;
        }
        getOffscreenOpacity(offscreenIndex) {
            if (offscreenIndex < 0 || offscreenIndex >= this._model.offscreens.count) {
                return 1.0;
            }
            return this._model.offscreens.opacities[offscreenIndex];
        }
        getOffscreenMasks() {
            return this._model.offscreens.masks;
        }
        getOffscreenMaskCounts() {
            return this._model.offscreens.maskCounts;
        }
        getOffscreenInvertedMask(offscreenIndex) {
            const constantFlags = this._model.offscreens.constantFlags;
            return Live2DCubismCore.Utils.hasIsInvertedMaskBit(constantFlags[offscreenIndex]);
        }
        isBlendModeEnabled() {
            return this._isBlendModeEnabled;
        }
        loadParameters() {
            let parameterCount = this._model.parameters.count;
            const savedParameterCount = this._savedParameters.length;
            if (parameterCount > savedParameterCount) {
                parameterCount = savedParameterCount;
            }
            for (let i = 0; i < parameterCount; ++i) {
                this._parameterValues[i] = this._savedParameters[i];
            }
        }
        initialize() {
            (0, cubismdebug_2.CSM_ASSERT)(this._model);
            this._parameterValues = this._model.parameters.values;
            this._partOpacities = this._model.parts.opacities;
            this._offscreenOpacities = this._model.offscreens.opacities;
            this._parameterMaximumValues = this._model.parameters.maximumValues;
            this._parameterMinimumValues = this._model.parameters.minimumValues;
            {
                const parameterIds = this._model.parameters.ids;
                const parameterCount = this._model.parameters.count;
                this._parameterIds.length = parameterCount;
                this._userParameterRepeatDataList.length = parameterCount;
                for (let i = 0; i < parameterCount; ++i) {
                    this._parameterIds[i] = live2dcubismframework_2.CubismFramework.getIdManager().getId(parameterIds[i]);
                    this._userParameterRepeatDataList[i] = new ParameterRepeatData(false, false);
                }
            }
            const partCount = this._model.parts.count;
            {
                const partIds = this._model.parts.ids;
                this._partIds.length = partCount;
                for (let i = 0; i < partCount; ++i) {
                    this._partIds[i] = live2dcubismframework_2.CubismFramework.getIdManager().getId(partIds[i]);
                }
            }
            {
                const drawableIds = this._model.drawables.ids;
                const drawableCount = this._model.drawables.count;
                this._userDrawableCullings.length = drawableCount;
                const userCulling = new CullingData(false, false);
                this._userOffscreenCullings.length = this._model.offscreens.count;
                const userOffscreenCulling = new CullingData(false, false);
                {
                    for (let i = 0; i < drawableCount; ++i) {
                        this._drawableIds.push(live2dcubismframework_2.CubismFramework.getIdManager().getId(drawableIds[i]));
                        this._userDrawableCullings[i] = userCulling;
                    }
                }
                {
                    for (let i = 0; i < this._model.offscreens.count; ++i) {
                        this._userOffscreenCullings[i] = userOffscreenCulling;
                    }
                }
                if (this.getOffscreenCount() > 0) {
                    this._isBlendModeEnabled = true;
                }
                else {
                    const blendModes = this._model.drawables.blendModes;
                    for (let i = 0; i < drawableCount; ++i) {
                        const colorBlendType = this.getDrawableColorBlend(i);
                        const alphaBlendType = this.getDrawableAlphaBlend(i);
                        if (!(colorBlendType == CubismColorBlend.ColorBlend_Normal &&
                            alphaBlendType == CubismAlphaBlend.AlphaBlend_Over) &&
                            colorBlendType != CubismColorBlend.ColorBlend_AddCompatible &&
                            colorBlendType != CubismColorBlend.ColorBlend_MultiplyCompatible) {
                            this._isBlendModeEnabled = true;
                            break;
                        }
                    }
                }
                this.setupPartsHierarchy();
                const offscreenCount = this.getOffscreenCount();
                this._overrideMultiplyAndScreenColor.initialize(partCount, drawableCount, offscreenCount);
            }
        }
        getPartsHierarchy() {
            return this._partsHierarchy;
        }
        setupPartsHierarchy() {
            this._partsHierarchy.length = 0;
            const partCount = this.getPartCount();
            this._partsHierarchy.length = partCount;
            for (let i = 0; i < partCount; ++i) {
                const partInfo = new CubismModelPartInfo();
                this._partsHierarchy[i] = partInfo;
            }
            for (let i = 0; i < partCount; ++i) {
                const parentPartIndex = this.getPartParentPartIndices()[i];
                if (parentPartIndex === exports.NoParentIndex) {
                    continue;
                }
                for (let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex) {
                    if (partIndex === parentPartIndex) {
                        const objectInfo = new CubismModelObjectInfo(i, CubismModelObjectType.CubismModelObjectType_Parts);
                        this._partsHierarchy[partIndex].objects.push(objectInfo);
                        break;
                    }
                }
            }
            const drawableCount = this.getDrawableCount();
            for (let i = 0; i < drawableCount; ++i) {
                const parentPartIndex = this.getDrawableParentPartIndex(i);
                if (parentPartIndex === exports.NoParentIndex) {
                    continue;
                }
                for (let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex) {
                    if (partIndex === parentPartIndex) {
                        const objectInfo = new CubismModelObjectInfo(i, CubismModelObjectType.CubismModelObjectType_Drawable);
                        this._partsHierarchy[partIndex].objects.push(objectInfo);
                        break;
                    }
                }
            }
            for (let i = 0; i < this._partsHierarchy.length; ++i) {
                this.getPartChildDrawObjects(i);
            }
        }
        getPartChildDrawObjects(partInfoIndex) {
            if (this._partsHierarchy[partInfoIndex].getChildObjectCount() < 1) {
                return this._partsHierarchy[partInfoIndex].childDrawObjects;
            }
            const childDrawObjects = this._partsHierarchy[partInfoIndex].childDrawObjects;
            if (childDrawObjects.drawableIndices.length !== 0 ||
                childDrawObjects.offscreenIndices.length !== 0) {
                return childDrawObjects;
            }
            const objects = this._partsHierarchy[partInfoIndex].objects;
            for (let i = 0; i < objects.length; ++i) {
                const obj = objects[i];
                if (obj.objectType === CubismModelObjectType.CubismModelObjectType_Parts) {
                    this.getPartChildDrawObjects(obj.objectIndex);
                    const childToChildDrawObjects = this._partsHierarchy[obj.objectIndex].childDrawObjects;
                    childDrawObjects.drawableIndices.push(...childToChildDrawObjects.drawableIndices);
                    childDrawObjects.offscreenIndices.push(...childToChildDrawObjects.offscreenIndices);
                    const offscreenIndices = this.getOffscreenIndices();
                    const offscreenIndex = offscreenIndices
                        ? offscreenIndices[obj.objectIndex]
                        : exports.NoOffscreenIndex;
                    if (offscreenIndex !== exports.NoOffscreenIndex) {
                        childDrawObjects.offscreenIndices.push(offscreenIndex);
                    }
                }
                else if (obj.objectType === CubismModelObjectType.CubismModelObjectType_Drawable) {
                    childDrawObjects.drawableIndices.push(obj.objectIndex);
                }
            }
            return childDrawObjects;
        }
        getOffscreenIndices() {
            return this._model.parts.offscreenIndices;
        }
        constructor(model) {
            this._model = model;
            this._parameterValues = null;
            this._parameterMaximumValues = null;
            this._parameterMinimumValues = null;
            this._partOpacities = null;
            this._offscreenOpacities = null;
            this._savedParameters = new Array();
            this._parameterIds = new Array();
            this._drawableIds = new Array();
            this._partIds = new Array();
            this._isOverriddenParameterRepeat = true;
            this._isOverriddenCullings = false;
            this._modelOpacity = 1.0;
            this._overrideMultiplyAndScreenColor =
                new cubismmodelmultiplyandscreencolor_1.CubismModelMultiplyAndScreenColor(this);
            this._isBlendModeEnabled = false;
            this._drawableColorBlends = null;
            this._drawableAlphaBlends = null;
            this._offscreenColorBlends = null;
            this._offscreenAlphaBlends = null;
            this._drawableMultiplyColors = null;
            this._drawableScreenColors = null;
            this._offscreenMultiplyColors = null;
            this._offscreenScreenColors = null;
            this._userParameterRepeatDataList = new Array();
            this._userDrawableCullings = new Array();
            this._userOffscreenCullings = new Array();
            this._partsHierarchy = new Array();
            this._notExistPartId = new Map();
            this._notExistParameterId = new Map();
            this._notExistParameterValues = new Map();
            this._notExistPartOpacities = new Map();
            this._drawableColorBlends = new Array(model.drawables.count).fill(CubismColorBlend.ColorBlend_None);
            this._drawableAlphaBlends = new Array(model.drawables.count).fill(CubismAlphaBlend.AlphaBlend_None);
            this._offscreenColorBlends = new Array(model.offscreens.count).fill(CubismColorBlend.ColorBlend_None);
            this._offscreenAlphaBlends = new Array(model.offscreens.count).fill(CubismAlphaBlend.AlphaBlend_None);
        }
        release() {
            this._model.release();
            this._model = null;
            this._drawableColorBlends = null;
            this._drawableAlphaBlends = null;
            this._offscreenColorBlends = null;
            this._offscreenAlphaBlends = null;
            this._drawableMultiplyColors = null;
            this._drawableScreenColors = null;
            this._offscreenMultiplyColors = null;
            this._offscreenScreenColors = null;
        }
    }
    exports.CubismModel = CubismModel;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismModel = $.CubismModel;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/type/csmrectf", ["require", "exports", "framework/src/type/csmrectf"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.csmRect = void 0;
    class csmRect {
        constructor(x, y, w, h) {
            this.x = x;
            this.y = y;
            this.width = w;
            this.height = h;
        }
        getCenterX() {
            return this.x + 0.5 * this.width;
        }
        getCenterY() {
            return this.y + 0.5 * this.height;
        }
        getRight() {
            return this.x + this.width;
        }
        getBottom() {
            return this.y + this.height;
        }
        setRect(r) {
            this.x = r.x;
            this.y = r.y;
            this.width = r.width;
            this.height = r.height;
        }
        expand(w, h) {
            this.x -= w;
            this.y -= h;
            this.width += w * 2.0;
            this.height += h * 2.0;
        }
    }
    exports.csmRect = csmRect;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.csmRect = $.csmRect;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/rendering/cubismclippingmanager", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/type/csmrectf", "framework/src/math/cubismmatrix44", "framework/src/rendering/cubismrenderer", "framework/src/utils/cubismdebug"], function (require, exports, live2dcubismframework_3, csmrectf_1, cubismmatrix44_1, cubismrenderer_3, cubismdebug_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CubismClippingManager = void 0;
    const ColorChannelCount = 4;
    const ClippingMaskMaxCountOnDefault = 36;
    const ClippingMaskMaxCountOnMultiRenderTexture = 32;
    class CubismClippingManager {
        constructor(clippingContextFactory) {
            this._renderTextureCount = 0;
            this._clippingMaskBufferSize = 256;
            this._clippingContextListForMask = new Array();
            this._clippingContextListForDraw = new Array();
            this._clippingContextListForOffscreen = new Array();
            this._tmpBoundsOnModel = new csmrectf_1.csmRect();
            this._tmpMatrix = new cubismmatrix44_1.CubismMatrix44();
            this._tmpMatrixForMask = new cubismmatrix44_1.CubismMatrix44();
            this._tmpMatrixForDraw = new cubismmatrix44_1.CubismMatrix44();
            this._clearedMaskBufferFlags = new Array();
            this._clippingContexttConstructor = clippingContextFactory;
            this._channelColors = [
                new cubismrenderer_3.CubismTextureColor(1.0, 0.0, 0.0, 0.0),
                new cubismrenderer_3.CubismTextureColor(0.0, 1.0, 0.0, 0.0),
                new cubismrenderer_3.CubismTextureColor(0.0, 0.0, 1.0, 0.0),
                new cubismrenderer_3.CubismTextureColor(0.0, 0.0, 0.0, 1.0)
            ];
        }
        release() {
            for (let i = 0; i < this._clippingContextListForMask.length; i++) {
                if (this._clippingContextListForMask[i]) {
                    this._clippingContextListForMask[i].release();
                    this._clippingContextListForMask[i] = void 0;
                }
                this._clippingContextListForMask[i] = null;
            }
            this._clippingContextListForMask = null;
            for (let i = 0; i < this._clippingContextListForDraw.length; i++) {
                this._clippingContextListForDraw[i] = null;
            }
            this._clippingContextListForDraw = null;
            for (let i = 0; i < this._channelColors.length; i++) {
                this._channelColors[i] = null;
            }
            this._channelColors = null;
            if (this._clearedMaskBufferFlags != null) {
                this._clearedMaskBufferFlags.length = 0;
            }
            this._clearedMaskBufferFlags = null;
        }
        initializeForDrawable(model, renderTextureCount) {
            if (renderTextureCount % 1 != 0) {
                (0, cubismdebug_3.CubismLogWarning)('The number of render textures must be specified as an integer. The decimal point is rounded down and corrected to an integer.');
                renderTextureCount = ~~renderTextureCount;
            }
            if (renderTextureCount < 1) {
                (0, cubismdebug_3.CubismLogWarning)('The number of render textures must be an integer greater than or equal to 1. Set the number of render textures to 1.');
            }
            this._renderTextureCount = renderTextureCount < 1 ? 1 : renderTextureCount;
            this._clearedMaskBufferFlags = new Array(this._renderTextureCount);
            this._clippingContextListForDraw.length = model.getDrawableCount();
            for (let i = 0; i < model.getDrawableCount(); i++) {
                if (model.getDrawableMaskCounts()[i] <= 0) {
                    this._clippingContextListForDraw[i] = null;
                    continue;
                }
                let clippingContext = this.findSameClip(model.getDrawableMasks()[i], model.getDrawableMaskCounts()[i]);
                if (clippingContext == null) {
                    clippingContext = new this._clippingContexttConstructor(this, model.getDrawableMasks()[i], model.getDrawableMaskCounts()[i]);
                    this._clippingContextListForMask.push(clippingContext);
                }
                clippingContext.addClippedDrawable(i);
                this._clippingContextListForDraw[i] = clippingContext;
            }
        }
        initializeForOffscreen(model, maskBufferCount) {
            this._renderTextureCount = maskBufferCount;
            this._clearedMaskBufferFlags.length = this._renderTextureCount;
            for (let i = 0; i < this._renderTextureCount; ++i) {
                this._clearedMaskBufferFlags[i] = false;
            }
            this._clippingContextListForOffscreen.length = model.getOffscreenCount();
            for (let i = 0; i < model.getOffscreenCount(); ++i) {
                if (model.getOffscreenMaskCounts()[i] <= 0) {
                    this._clippingContextListForOffscreen.push(null);
                    continue;
                }
                let cc = this.findSameClip(model.getOffscreenMasks()[i], model.getOffscreenMaskCounts()[i]);
                if (cc == null) {
                    cc = new this._clippingContexttConstructor(this, model.getOffscreenMasks()[i], model.getOffscreenMaskCounts()[i]);
                    this._clippingContextListForMask.push(cc);
                }
                cc.addClippedOffscreen(i);
                this._clippingContextListForOffscreen[i] = cc;
            }
        }
        findSameClip(drawableMasks, drawableMaskCounts) {
            for (let i = 0; i < this._clippingContextListForMask.length; i++) {
                const clippingContext = this._clippingContextListForMask[i];
                const count = clippingContext._clippingIdCount;
                if (count != drawableMaskCounts) {
                    continue;
                }
                let sameCount = 0;
                for (let j = 0; j < count; j++) {
                    const clipId = clippingContext._clippingIdList[j];
                    for (let k = 0; k < count; k++) {
                        if (drawableMasks[k] == clipId) {
                            sameCount++;
                            break;
                        }
                    }
                }
                if (sameCount == count) {
                    return clippingContext;
                }
            }
            return null;
        }
        setupMatrixForHighPrecision(model, isRightHanded) {
            let usingClipCount = 0;
            for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
                const cc = this._clippingContextListForMask[clipIndex];
                this.calcClippedDrawableTotalBounds(model, cc);
                if (cc._isUsing) {
                    usingClipCount++;
                }
            }
            if (usingClipCount > 0) {
                this.setupLayoutBounds(0);
                if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
                    this._clearedMaskBufferFlags.length = this._renderTextureCount;
                    for (let i = 0; i < this._renderTextureCount; i++) {
                        this._clearedMaskBufferFlags[i] = false;
                    }
                }
                else {
                    for (let i = 0; i < this._renderTextureCount; i++) {
                        this._clearedMaskBufferFlags[i] = false;
                    }
                }
                for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
                    const clipContext = this._clippingContextListForMask[clipIndex];
                    const allClippedDrawRect = clipContext._allClippedDrawRect;
                    const layoutBoundsOnTex01 = clipContext._layoutBounds;
                    const margin = 0.05;
                    let scaleX = 0.0;
                    let scaleY = 0.0;
                    const ppu = model.getPixelsPerUnit();
                    const maskPixelSize = clipContext
                        .getClippingManager()
                        .getClippingMaskBufferSize();
                    const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixelSize;
                    const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixelSize;
                    this._tmpBoundsOnModel.setRect(allClippedDrawRect);
                    if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
                        this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0.0);
                        scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
                    }
                    else {
                        scaleX = ppu / physicalMaskWidth;
                    }
                    if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
                        this._tmpBoundsOnModel.expand(0.0, allClippedDrawRect.height * margin);
                        scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
                    }
                    else {
                        scaleY = ppu / physicalMaskHeight;
                    }
                    this.createMatrixForMask(isRightHanded, layoutBoundsOnTex01, scaleX, scaleY);
                    clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
                    clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
                }
            }
        }
        setupMatrixForOffscreenHighPrecision(model, isRightHanded, mvp) {
            let usingClipCount = 0;
            for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
                const cc = this._clippingContextListForMask[clipIndex];
                this.calcClippedOffscreenTotalBounds(model, cc);
                if (cc._isUsing) {
                    usingClipCount++;
                }
            }
            if (usingClipCount <= 0) {
                return;
            }
            this.setupLayoutBounds(0);
            if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
                this._clearedMaskBufferFlags.length = this._renderTextureCount;
                for (let i = 0; i < this._renderTextureCount; ++i) {
                    this._clearedMaskBufferFlags[i] = false;
                }
            }
            else {
                for (let i = 0; i < this._renderTextureCount; ++i) {
                    this._clearedMaskBufferFlags[i] = false;
                }
            }
            for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
                const clipContext = this._clippingContextListForMask[clipIndex];
                const allClippedDrawRect = clipContext._allClippedDrawRect;
                const layoutBoundsOnTex01 = clipContext._layoutBounds;
                const margin = 0.05;
                let scaleX = 0.0;
                let scaleY = 0.0;
                const ppu = model.getPixelsPerUnit();
                const maskPixel = clipContext
                    .getClippingManager()
                    .getClippingMaskBufferSize();
                const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixel;
                const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixel;
                this._tmpBoundsOnModel.setRect(allClippedDrawRect);
                if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
                    this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0.0);
                    scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
                }
                else {
                    scaleX = ppu / physicalMaskWidth;
                }
                if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
                    this._tmpBoundsOnModel.expand(0.0, allClippedDrawRect.height * margin);
                    scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
                }
                else {
                    scaleY = ppu / physicalMaskHeight;
                }
                this.createMatrixForMask(isRightHanded, layoutBoundsOnTex01, scaleX, scaleY);
                clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
                clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
                const invertMvp = mvp.getInvert();
                clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
            }
        }
        calcClippedOffscreenTotalBounds(model, clippingContext) {
            let clippedDrawTotalMinX = Number.MAX_VALUE, clippedDrawTotalMinY = Number.MAX_VALUE;
            let clippedDrawTotalMaxX = -Number.MAX_VALUE, clippedDrawTotalMaxY = -Number.MAX_VALUE;
            const clippedOffscreenCount = clippingContext._clippedOffscreenIndexList.length;
            const clippedOffscreenChildDrawableIndexList = new Array();
            for (let clippedOffscreenIndex = 0; clippedOffscreenIndex < clippedOffscreenCount; clippedOffscreenIndex++) {
                const offscreenIndex = clippingContext._clippedOffscreenIndexList[clippedOffscreenIndex];
                this.getOffscreenChildDrawableIndexList(model, offscreenIndex, clippedOffscreenChildDrawableIndexList);
            }
            const childDrawableCount = clippedOffscreenChildDrawableIndexList.length;
            for (let childDrawableIndex = 0; childDrawableIndex < childDrawableCount; childDrawableIndex++) {
                const drawableVertexCount = model.getDrawableVertexCount(clippedOffscreenChildDrawableIndexList[childDrawableIndex]);
                const drawableVertexes = model.getDrawableVertices(clippedOffscreenChildDrawableIndexList[childDrawableIndex]);
                let minX = Number.MAX_VALUE, minY = Number.MAX_VALUE;
                let maxX = -Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
                const loop = drawableVertexCount * live2dcubismframework_3.Constant.vertexStep;
                for (let pi = live2dcubismframework_3.Constant.vertexOffset; pi < loop; pi += live2dcubismframework_3.Constant.vertexStep) {
                    const x = drawableVertexes[pi];
                    const y = drawableVertexes[pi + 1];
                    if (x < minX)
                        minX = x;
                    if (x > maxX)
                        maxX = x;
                    if (y < minY)
                        minY = y;
                    if (y > maxY)
                        maxY = y;
                }
                if (minX == Number.MAX_VALUE)
                    continue;
                if (minX < clippedDrawTotalMinX)
                    clippedDrawTotalMinX = minX;
                if (minY < clippedDrawTotalMinY)
                    clippedDrawTotalMinY = minY;
                if (maxX > clippedDrawTotalMaxX)
                    clippedDrawTotalMaxX = maxX;
                if (maxY > clippedDrawTotalMaxY)
                    clippedDrawTotalMaxY = maxY;
            }
            if (clippedDrawTotalMinX == Number.MAX_VALUE) {
                clippingContext._allClippedDrawRect.x = 0.0;
                clippingContext._allClippedDrawRect.y = 0.0;
                clippingContext._allClippedDrawRect.width = 0.0;
                clippingContext._allClippedDrawRect.height = 0.0;
                clippingContext._isUsing = false;
            }
            else {
                clippingContext._isUsing = true;
                const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
                const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
                clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
                clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
                clippingContext._allClippedDrawRect.width = w;
                clippingContext._allClippedDrawRect.height = h;
            }
        }
        getOffscreenChildDrawableIndexList(model, offscreenIndex, childDrawableIndexList) {
            const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];
            this.getPartChildDrawableIndexList(model, ownerIndex, childDrawableIndexList);
        }
        getPartChildDrawableIndexList(model, partIndex, childDrawableIndexList) {
            const childDrawObjects = model.getPartsHierarchy()[partIndex].childDrawObjects;
            childDrawableIndexList.push(...childDrawObjects.drawableIndices);
            for (let i = 0; i < childDrawObjects.offscreenIndices.length; ++i) {
                this.getOffscreenChildDrawableIndexList(model, childDrawObjects.offscreenIndices[i], childDrawableIndexList);
            }
        }
        createMatrixForMask(isRightHanded, layoutBoundsOnTex01, scaleX, scaleY) {
            this._tmpMatrix.loadIdentity();
            {
                this._tmpMatrix.translateRelative(-1.0, -1.0);
                this._tmpMatrix.scaleRelative(2.0, 2.0);
            }
            {
                this._tmpMatrix.translateRelative(layoutBoundsOnTex01.x, layoutBoundsOnTex01.y);
                this._tmpMatrix.scaleRelative(scaleX, scaleY);
                this._tmpMatrix.translateRelative(-this._tmpBoundsOnModel.x, -this._tmpBoundsOnModel.y);
            }
            this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
            this._tmpMatrix.loadIdentity();
            {
                this._tmpMatrix.translateRelative(layoutBoundsOnTex01.x, layoutBoundsOnTex01.y * (isRightHanded ? -1.0 : 1.0));
                this._tmpMatrix.scaleRelative(scaleX, scaleY * (isRightHanded ? -1.0 : 1.0));
                this._tmpMatrix.translateRelative(-this._tmpBoundsOnModel.x, -this._tmpBoundsOnModel.y);
            }
            this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
        }
        setupLayoutBounds(usingClipCount) {
            const useClippingMaskMaxCount = this._renderTextureCount <= 1
                ? ClippingMaskMaxCountOnDefault
                : ClippingMaskMaxCountOnMultiRenderTexture * this._renderTextureCount;
            if (usingClipCount <= 0 || usingClipCount > useClippingMaskMaxCount) {
                if (usingClipCount > useClippingMaskMaxCount) {
                    (0, cubismdebug_3.CubismLogError)('not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}', usingClipCount - useClippingMaskMaxCount, this._renderTextureCount, usingClipCount);
                }
                for (let index = 0; index < this._clippingContextListForMask.length; index++) {
                    const clipContext = this._clippingContextListForMask[index];
                    clipContext._layoutChannelIndex = 0;
                    clipContext._layoutBounds.x = 0.0;
                    clipContext._layoutBounds.y = 0.0;
                    clipContext._layoutBounds.width = 1.0;
                    clipContext._layoutBounds.height = 1.0;
                    clipContext._bufferIndex = 0;
                }
                return;
            }
            const layoutCountMaxValue = this._renderTextureCount <= 1 ? 9 : 8;
            let countPerSheetDiv = usingClipCount / this._renderTextureCount;
            const reduceLayoutTextureCount = usingClipCount % this._renderTextureCount;
            countPerSheetDiv = Math.ceil(countPerSheetDiv);
            let divCount = countPerSheetDiv / ColorChannelCount;
            const modCount = countPerSheetDiv % ColorChannelCount;
            divCount = ~~divCount;
            let curClipIndex = 0;
            for (let renderTextureIndex = 0; renderTextureIndex < this._renderTextureCount; renderTextureIndex++) {
                for (let channelIndex = 0; channelIndex < ColorChannelCount; channelIndex++) {
                    let layoutCount = divCount + (channelIndex < modCount ? 1 : 0);
                    const checkChannelIndex = modCount + (divCount < 1 ? -1 : 0);
                    if (channelIndex == checkChannelIndex && reduceLayoutTextureCount > 0) {
                        layoutCount -= !(renderTextureIndex < reduceLayoutTextureCount)
                            ? 1
                            : 0;
                    }
                    if (layoutCount == 0) {
                    }
                    else if (layoutCount == 1) {
                        const clipContext = this._clippingContextListForMask[curClipIndex++];
                        clipContext._layoutChannelIndex = channelIndex;
                        clipContext._layoutBounds.x = 0.0;
                        clipContext._layoutBounds.y = 0.0;
                        clipContext._layoutBounds.width = 1.0;
                        clipContext._layoutBounds.height = 1.0;
                        clipContext._bufferIndex = renderTextureIndex;
                    }
                    else if (layoutCount == 2) {
                        for (let i = 0; i < layoutCount; i++) {
                            let xpos = i % 2;
                            xpos = ~~xpos;
                            const cc = this._clippingContextListForMask[curClipIndex++];
                            cc._layoutChannelIndex = channelIndex;
                            cc._layoutBounds.x = xpos * 0.5;
                            cc._layoutBounds.y = 0.0;
                            cc._layoutBounds.width = 0.5;
                            cc._layoutBounds.height = 1.0;
                            cc._bufferIndex = renderTextureIndex;
                        }
                    }
                    else if (layoutCount <= 4) {
                        for (let i = 0; i < layoutCount; i++) {
                            let xpos = i % 2;
                            let ypos = i / 2;
                            xpos = ~~xpos;
                            ypos = ~~ypos;
                            const cc = this._clippingContextListForMask[curClipIndex++];
                            cc._layoutChannelIndex = channelIndex;
                            cc._layoutBounds.x = xpos * 0.5;
                            cc._layoutBounds.y = ypos * 0.5;
                            cc._layoutBounds.width = 0.5;
                            cc._layoutBounds.height = 0.5;
                            cc._bufferIndex = renderTextureIndex;
                        }
                    }
                    else if (layoutCount <= layoutCountMaxValue) {
                        for (let i = 0; i < layoutCount; i++) {
                            let xpos = i % 3;
                            let ypos = i / 3;
                            xpos = ~~xpos;
                            ypos = ~~ypos;
                            const cc = this._clippingContextListForMask[curClipIndex++];
                            cc._layoutChannelIndex = channelIndex;
                            cc._layoutBounds.x = xpos / 3.0;
                            cc._layoutBounds.y = ypos / 3.0;
                            cc._layoutBounds.width = 1.0 / 3.0;
                            cc._layoutBounds.height = 1.0 / 3.0;
                            cc._bufferIndex = renderTextureIndex;
                        }
                    }
                    else {
                        (0, cubismdebug_3.CubismLogError)('not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}', usingClipCount - useClippingMaskMaxCount, this._renderTextureCount, usingClipCount);
                        for (let index = 0; index < layoutCount; index++) {
                            const cc = this._clippingContextListForMask[curClipIndex++];
                            cc._layoutChannelIndex = 0;
                            cc._layoutBounds.x = 0.0;
                            cc._layoutBounds.y = 0.0;
                            cc._layoutBounds.width = 1.0;
                            cc._layoutBounds.height = 1.0;
                            cc._bufferIndex = 0;
                        }
                    }
                }
            }
        }
        calcClippedDrawableTotalBounds(model, clippingContext) {
            let clippedDrawTotalMinX = Number.MAX_VALUE;
            let clippedDrawTotalMinY = Number.MAX_VALUE;
            let clippedDrawTotalMaxX = Number.MIN_VALUE;
            let clippedDrawTotalMaxY = Number.MIN_VALUE;
            const clippedDrawCount = clippingContext._clippedDrawableIndexList.length;
            for (let clippedDrawableIndex = 0; clippedDrawableIndex < clippedDrawCount; clippedDrawableIndex++) {
                const drawableIndex = clippingContext._clippedDrawableIndexList[clippedDrawableIndex];
                const drawableVertexCount = model.getDrawableVertexCount(drawableIndex);
                const drawableVertexes = model.getDrawableVertices(drawableIndex);
                let minX = Number.MAX_VALUE;
                let minY = Number.MAX_VALUE;
                let maxX = -Number.MAX_VALUE;
                let maxY = -Number.MAX_VALUE;
                const loop = drawableVertexCount * live2dcubismframework_3.Constant.vertexStep;
                for (let pi = live2dcubismframework_3.Constant.vertexOffset; pi < loop; pi += live2dcubismframework_3.Constant.vertexStep) {
                    const x = drawableVertexes[pi];
                    const y = drawableVertexes[pi + 1];
                    if (x < minX) {
                        minX = x;
                    }
                    if (x > maxX) {
                        maxX = x;
                    }
                    if (y < minY) {
                        minY = y;
                    }
                    if (y > maxY) {
                        maxY = y;
                    }
                }
                if (minX == Number.MAX_VALUE) {
                    continue;
                }
                if (minX < clippedDrawTotalMinX) {
                    clippedDrawTotalMinX = minX;
                }
                if (minY < clippedDrawTotalMinY) {
                    clippedDrawTotalMinY = minY;
                }
                if (maxX > clippedDrawTotalMaxX) {
                    clippedDrawTotalMaxX = maxX;
                }
                if (maxY > clippedDrawTotalMaxY) {
                    clippedDrawTotalMaxY = maxY;
                }
                if (clippedDrawTotalMinX == Number.MAX_VALUE) {
                    clippingContext._allClippedDrawRect.x = 0.0;
                    clippingContext._allClippedDrawRect.y = 0.0;
                    clippingContext._allClippedDrawRect.width = 0.0;
                    clippingContext._allClippedDrawRect.height = 0.0;
                    clippingContext._isUsing = false;
                }
                else {
                    clippingContext._isUsing = true;
                    const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
                    const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
                    clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
                    clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
                    clippingContext._allClippedDrawRect.width = w;
                    clippingContext._allClippedDrawRect.height = h;
                }
            }
        }
        getClippingContextListForDraw() {
            return this._clippingContextListForDraw;
        }
        getClippingContextListForOffscreen() {
            return this._clippingContextListForOffscreen;
        }
        getClippingMaskBufferSize() {
            return this._clippingMaskBufferSize;
        }
        getRenderTextureCount() {
            return this._renderTextureCount;
        }
        getChannelFlagAsColor(channelNo) {
            return this._channelColors[channelNo];
        }
        setClippingMaskBufferSize(size) {
            this._clippingMaskBufferSize = size;
        }
    }
    exports.CubismClippingManager = CubismClippingManager;
});
define("framework/src/rendering/cubismrenderer", ["require", "exports", "framework/src/math/cubismmath", "framework/src/math/cubismmatrix44", "framework/src/type/csmrectf", "framework/src/utils/cubismdebug", "framework/src/rendering/cubismrenderer"], function (require, exports, cubismmath_3, cubismmatrix44_2, csmrectf_2, cubismdebug_4, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismClippingContext = exports.CubismTextureColor = exports.DrawableObjectType = exports.CubismBlendMode = exports.CubismRenderer = void 0;
    class CubismRenderer {
        static create() {
            return null;
        }
        static delete(renderer) {
            renderer = null;
        }
        initialize(model) {
            this._model = model;
            if (model.isBlendModeEnabled()) {
                this.useHighPrecisionMask(true);
                (0, cubismdebug_4.CubismLogInfo)('This model uses a high-resolution mask because it operates in blend mode.');
            }
        }
        drawModel(shaderPath = null) {
            if (this.getModel() == null)
                return;
            this.doDrawModel(shaderPath);
        }
        setMvpMatrix(matrix44) {
            this._mvpMatrix4x4.setMatrix(matrix44.getArray());
        }
        getMvpMatrix() {
            return this._mvpMatrix4x4;
        }
        setModelColor(red, green, blue, alpha) {
            this._modelColor.r = cubismmath_3.CubismMath.clamp(red, 0.0, 1.0);
            this._modelColor.g = cubismmath_3.CubismMath.clamp(green, 0.0, 1.0);
            this._modelColor.b = cubismmath_3.CubismMath.clamp(blue, 0.0, 1.0);
            this._modelColor.a = cubismmath_3.CubismMath.clamp(alpha, 0.0, 1.0);
        }
        getModelColor() {
            return JSON.parse(JSON.stringify(this._modelColor));
        }
        getModelColorWithOpacity(opacity) {
            const modelColorRGBA = this.getModelColor();
            modelColorRGBA.a *= opacity;
            if (this.isPremultipliedAlpha()) {
                modelColorRGBA.r *= modelColorRGBA.a;
                modelColorRGBA.g *= modelColorRGBA.a;
                modelColorRGBA.b *= modelColorRGBA.a;
            }
            return modelColorRGBA;
        }
        setIsPremultipliedAlpha(enable) {
            this._isPremultipliedAlpha = enable;
        }
        isPremultipliedAlpha() {
            return this._isPremultipliedAlpha;
        }
        setIsCulling(culling) {
            this._isCulling = culling;
        }
        isCulling() {
            return this._isCulling;
        }
        setAnisotropy(n) {
            this._anisotropy = n;
        }
        getAnisotropy() {
            return this._anisotropy;
        }
        getModel() {
            return this._model;
        }
        useHighPrecisionMask(high) {
            this._useHighPrecisionMask = high;
        }
        isUsingHighPrecisionMask() {
            return this._useHighPrecisionMask;
        }
        setRenderTargetSize(width, height) {
            this._modelRenderTargetWidth = width;
            this._modelRenderTargetHeight = height;
        }
        constructor(width, height) {
            this._modelRenderTargetWidth = width;
            this._modelRenderTargetHeight = height;
            this._isCulling = false;
            this._isPremultipliedAlpha = false;
            this._anisotropy = 0.0;
            this._model = null;
            this._modelColor = new CubismTextureColor();
            this._useHighPrecisionMask = false;
            this._mvpMatrix4x4 = new cubismmatrix44_2.CubismMatrix44();
            this._mvpMatrix4x4.loadIdentity();
        }
    }
    exports.CubismRenderer = CubismRenderer;
    var CubismBlendMode;
    (function (CubismBlendMode) {
        CubismBlendMode[CubismBlendMode["CubismBlendMode_Normal"] = 0] = "CubismBlendMode_Normal";
        CubismBlendMode[CubismBlendMode["CubismBlendMode_Additive"] = 1] = "CubismBlendMode_Additive";
        CubismBlendMode[CubismBlendMode["CubismBlendMode_Multiplicative"] = 2] = "CubismBlendMode_Multiplicative";
    })(CubismBlendMode || (exports.CubismBlendMode = CubismBlendMode = {}));
    var DrawableObjectType;
    (function (DrawableObjectType) {
        DrawableObjectType[DrawableObjectType["DrawableObjectType_Drawable"] = 0] = "DrawableObjectType_Drawable";
        DrawableObjectType[DrawableObjectType["DrawableObjectType_Offscreen"] = 1] = "DrawableObjectType_Offscreen";
    })(DrawableObjectType || (exports.DrawableObjectType = DrawableObjectType = {}));
    class CubismTextureColor {
        constructor(r = 1.0, g = 1.0, b = 1.0, a = 1.0) {
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
    }
    exports.CubismTextureColor = CubismTextureColor;
    class CubismClippingContext {
        constructor(clippingDrawableIndices, clipCount) {
            this._clippingIdList = clippingDrawableIndices;
            this._clippingIdCount = clipCount;
            this._allClippedDrawRect = new csmrectf_2.csmRect();
            this._layoutBounds = new csmrectf_2.csmRect();
            this._clippedDrawableIndexList = [];
            this._clippedOffscreenIndexList = [];
            this._matrixForMask = new cubismmatrix44_2.CubismMatrix44();
            this._matrixForDraw = new cubismmatrix44_2.CubismMatrix44();
            this._bufferIndex = 0;
            this._layoutChannelIndex = 0;
        }
        release() {
            if (this._layoutBounds != null) {
                this._layoutBounds = null;
            }
            if (this._allClippedDrawRect != null) {
                this._allClippedDrawRect = null;
            }
            if (this._clippedDrawableIndexList != null) {
                this._clippedDrawableIndexList = null;
            }
            if (this._clippedOffscreenIndexList != null) {
                this._clippedOffscreenIndexList = null;
            }
        }
        addClippedDrawable(drawableIndex) {
            this._clippedDrawableIndexList.push(drawableIndex);
        }
        addClippedOffscreen(offscreenIndex) {
            this._clippedOffscreenIndexList.push(offscreenIndex);
        }
    }
    exports.CubismClippingContext = CubismClippingContext;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismBlendMode = $.CubismBlendMode;
        Live2DCubismFramework.CubismRenderer = $.CubismRenderer;
        Live2DCubismFramework.CubismTextureColor = $.CubismTextureColor;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/utils/cubismjsonextension", ["require", "exports", "framework/src/utils/cubismjson"], function (require, exports, cubismjson_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CubismJsonExtension = void 0;
    class CubismJsonExtension {
        static parseJsonObject(obj, map) {
            Object.keys(obj).forEach(key => {
                if (typeof obj[key] == 'boolean') {
                    const convValue = Boolean(obj[key]);
                    map.put(key, new cubismjson_1.JsonBoolean(convValue));
                }
                else if (typeof obj[key] == 'string') {
                    const convValue = String(obj[key]);
                    map.put(key, new cubismjson_1.JsonString(convValue));
                }
                else if (typeof obj[key] == 'number') {
                    const convValue = Number(obj[key]);
                    map.put(key, new cubismjson_1.JsonFloat(convValue));
                }
                else if (obj[key] instanceof Array) {
                    map.put(key, CubismJsonExtension.parseJsonArray(obj[key]));
                }
                else if (obj[key] instanceof Object) {
                    map.put(key, CubismJsonExtension.parseJsonObject(obj[key], new cubismjson_1.JsonMap()));
                }
                else if (obj[key] == null) {
                    map.put(key, new cubismjson_1.JsonNullvalue());
                }
                else {
                    map.put(key, obj[key]);
                }
            });
            return map;
        }
        static parseJsonArray(obj) {
            const arr = new cubismjson_1.JsonArray();
            Object.keys(obj).forEach(key => {
                const convKey = Number(key);
                if (typeof convKey == 'number') {
                    if (typeof obj[key] == 'boolean') {
                        const convValue = Boolean(obj[key]);
                        arr.add(new cubismjson_1.JsonBoolean(convValue));
                    }
                    else if (typeof obj[key] == 'string') {
                        const convValue = String(obj[key]);
                        arr.add(new cubismjson_1.JsonString(convValue));
                    }
                    else if (typeof obj[key] == 'number') {
                        const convValue = Number(obj[key]);
                        arr.add(new cubismjson_1.JsonFloat(convValue));
                    }
                    else if (obj[key] instanceof Array) {
                        arr.add(this.parseJsonArray(obj[key]));
                    }
                    else if (obj[key] instanceof Object) {
                        arr.add(this.parseJsonObject(obj[key], new cubismjson_1.JsonMap()));
                    }
                    else if (obj[key] == null) {
                        arr.add(new cubismjson_1.JsonNullvalue());
                    }
                    else {
                        arr.add(obj[key]);
                    }
                }
                else if (obj[key] instanceof Array) {
                    arr.add(this.parseJsonArray(obj[key]));
                }
                else if (obj[key] instanceof Object) {
                    arr.add(this.parseJsonObject(obj[key], new cubismjson_1.JsonMap()));
                }
                else if (obj[key] == null) {
                    arr.add(new cubismjson_1.JsonNullvalue());
                }
                else {
                    const convValue = Array(obj[key]);
                    for (let i = 0; i < convValue.length; i++) {
                        arr.add(convValue[i]);
                    }
                }
            });
            return arr;
        }
    }
    exports.CubismJsonExtension = CubismJsonExtension;
});
define("framework/src/utils/cubismjson", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/utils/cubismdebug", "framework/src/utils/cubismjson", "framework/src/utils/cubismjsonextension"], function (require, exports, live2dcubismframework_4, cubismdebug_5, $, cubismjsonextension_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.JsonMap = exports.JsonArray = exports.JsonNullvalue = exports.JsonError = exports.JsonString = exports.JsonBoolean = exports.JsonFloat = exports.CubismJson = exports.Value = void 0;
    const CSM_JSON_ERROR_TYPE_MISMATCH = 'Error: type mismatch';
    const CSM_JSON_ERROR_INDEX_OF_BOUNDS = 'Error: index out of bounds';
    class Value {
        constructor() { }
        getRawString(defaultValue, indent) {
            return this.getString(defaultValue, indent);
        }
        toInt(defaultValue = 0) {
            return defaultValue;
        }
        toFloat(defaultValue = 0) {
            return defaultValue;
        }
        toBoolean(defaultValue = false) {
            return defaultValue;
        }
        getSize() {
            return 0;
        }
        getArray(defaultValue = null) {
            return defaultValue;
        }
        getVector(defaultValue = new Array()) {
            return defaultValue;
        }
        getMap(defaultValue) {
            return defaultValue;
        }
        getValueByIndex(index) {
            return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
        }
        getValueByString(s) {
            return Value.nullValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
        }
        getKeys() {
            return Value.dummyKeys;
        }
        isError() {
            return false;
        }
        isNull() {
            return false;
        }
        isBool() {
            return false;
        }
        isFloat() {
            return false;
        }
        isString() {
            return false;
        }
        isArray() {
            return false;
        }
        isMap() {
            return false;
        }
        equals(value) {
            return false;
        }
        isStatic() {
            return false;
        }
        setErrorNotForClientCall(errorStr) {
            return JsonError.errorValue;
        }
        static staticInitializeNotForClientCall() {
            JsonBoolean.trueValue = new JsonBoolean(true);
            JsonBoolean.falseValue = new JsonBoolean(false);
            Value.errorValue = new JsonError('ERROR', true);
            Value.nullValue = new JsonNullvalue();
            Value.dummyKeys = new Array();
        }
        static staticReleaseNotForClientCall() {
            JsonBoolean.trueValue = null;
            JsonBoolean.falseValue = null;
            Value.errorValue = null;
            Value.nullValue = null;
            Value.dummyKeys = null;
        }
    }
    exports.Value = Value;
    class CubismJson {
        constructor(buffer, length) {
            this._parseCallback = cubismjsonextension_1.CubismJsonExtension.parseJsonObject;
            this._error = null;
            this._lineCount = 0;
            this._root = null;
            if (buffer != undefined) {
                this.parseBytes(buffer, length, this._parseCallback);
            }
        }
        static create(buffer, size) {
            const json = new CubismJson();
            const succeeded = json.parseBytes(buffer, size, json._parseCallback);
            if (!succeeded) {
                CubismJson.delete(json);
                return null;
            }
            else {
                return json;
            }
        }
        static delete(instance) {
            instance = null;
        }
        getRoot() {
            return this._root;
        }
        static arrayBufferToString(buffer) {
            const uint8Array = new Uint8Array(buffer);
            let str = '';
            for (let i = 0, len = uint8Array.length; i < len; ++i) {
                str += '%' + this.pad(uint8Array[i].toString(16));
            }
            str = decodeURIComponent(str);
            return str;
        }
        static pad(n) {
            return n.length < 2 ? '0' + n : n;
        }
        parseBytes(buffer, size, parseCallback) {
            const endPos = new Array(1);
            const decodeBuffer = CubismJson.arrayBufferToString(buffer);
            if (parseCallback == undefined) {
                this._root = this.parseValue(decodeBuffer, size, 0, endPos);
            }
            else {
                this._root = parseCallback(JSON.parse(decodeBuffer), new JsonMap());
            }
            if (this._error) {
                let strbuf = '\0';
                strbuf = 'Json parse error : @line ' + (this._lineCount + 1) + '\n';
                this._root = new JsonString(strbuf);
                (0, cubismdebug_5.CubismLogInfo)('{0}', this._root.getRawString());
                return false;
            }
            else if (this._root == null) {
                this._root = new JsonError(this._error, false);
                return false;
            }
            return true;
        }
        getParseError() {
            return this._error;
        }
        checkEndOfFile() {
            return this._root.getArray()[1].equals('EOF');
        }
        parseValue(buffer, length, begin, outEndPos) {
            if (this._error)
                return null;
            let o = null;
            let i = begin;
            let f;
            for (; i < length; i++) {
                const c = buffer[i];
                switch (c) {
                    case '-':
                    case '.':
                    case '0':
                    case '1':
                    case '2':
                    case '3':
                    case '4':
                    case '5':
                    case '6':
                    case '7':
                    case '8':
                    case '9': {
                        const afterString = new Array(1);
                        f = (0, live2dcubismframework_4.strtod)(buffer.slice(i), afterString);
                        outEndPos[0] = buffer.indexOf(afterString[0]);
                        return new JsonFloat(f);
                    }
                    case '"':
                        return new JsonString(this.parseString(buffer, length, i + 1, outEndPos));
                    case '[':
                        o = this.parseArray(buffer, length, i + 1, outEndPos);
                        return o;
                    case '{':
                        o = this.parseObject(buffer, length, i + 1, outEndPos);
                        return o;
                    case 'n':
                        if (i + 3 < length) {
                            o = new JsonNullvalue();
                            outEndPos[0] = i + 4;
                        }
                        else {
                            this._error = 'parse null';
                        }
                        return o;
                    case 't':
                        if (i + 3 < length) {
                            o = JsonBoolean.trueValue;
                            outEndPos[0] = i + 4;
                        }
                        else {
                            this._error = 'parse true';
                        }
                        return o;
                    case 'f':
                        if (i + 4 < length) {
                            o = JsonBoolean.falseValue;
                            outEndPos[0] = i + 5;
                        }
                        else {
                            this._error = "illegal ',' position";
                        }
                        return o;
                    case ',':
                        this._error = "illegal ',' position";
                        return null;
                    case ']':
                        outEndPos[0] = i;
                        return null;
                    case '\n':
                        this._lineCount++;
                    case ' ':
                    case '\t':
                    case '\r':
                    default:
                        break;
                }
            }
            this._error = 'illegal end of value';
            return null;
        }
        parseString(string, length, begin, outEndPos) {
            if (this._error) {
                return null;
            }
            if (!string) {
                this._error = 'string is null';
                return null;
            }
            let i = begin;
            let c, c2;
            let ret = '';
            let bufStart = begin;
            for (; i < length; i++) {
                c = string[i];
                switch (c) {
                    case '"': {
                        outEndPos[0] = i + 1;
                        ret += string.substr(bufStart, i - bufStart);
                        return ret;
                    }
                    case '//': {
                        i++;
                        if (i - 1 > bufStart) {
                            ret += string.substr(bufStart, i - bufStart);
                        }
                        bufStart = i + 1;
                        if (i < length) {
                            c2 = string[i];
                            switch (c2) {
                                case '\\':
                                    ret += '\\';
                                    break;
                                case '"':
                                    ret += '"';
                                    break;
                                case '/':
                                    ret += '/';
                                    break;
                                case 'b':
                                    ret += '\b';
                                    break;
                                case 'f':
                                    ret += '\f';
                                    break;
                                case 'n':
                                    ret += '\n';
                                    break;
                                case 'r':
                                    ret += '\r';
                                    break;
                                case 't':
                                    ret += '\t';
                                    break;
                                case 'u':
                                    this._error = 'parse string/unicord escape not supported';
                                    break;
                                default:
                                    break;
                            }
                        }
                        else {
                            this._error = 'parse string/escape error';
                        }
                    }
                    default: {
                        break;
                    }
                }
            }
            this._error = 'parse string/illegal end';
            return null;
        }
        parseObject(buffer, length, begin, outEndPos) {
            if (this._error) {
                return null;
            }
            if (!buffer) {
                this._error = 'buffer is null';
                return null;
            }
            const ret = new JsonMap();
            let key = '';
            let i = begin;
            let c = '';
            const localRetEndPos2 = Array(1);
            let ok = false;
            for (; i < length; i++) {
                FOR_LOOP: for (; i < length; i++) {
                    c = buffer[i];
                    switch (c) {
                        case '"':
                            key = this.parseString(buffer, length, i + 1, localRetEndPos2);
                            if (this._error) {
                                return null;
                            }
                            i = localRetEndPos2[0];
                            ok = true;
                            break FOR_LOOP;
                        case '}':
                            outEndPos[0] = i + 1;
                            return ret;
                        case ':':
                            this._error = "illegal ':' position";
                            break;
                        case '\n':
                            this._lineCount++;
                        default:
                            break;
                    }
                }
                if (!ok) {
                    this._error = 'key not found';
                    return null;
                }
                ok = false;
                FOR_LOOP2: for (; i < length; i++) {
                    c = buffer[i];
                    switch (c) {
                        case ':':
                            ok = true;
                            i++;
                            break FOR_LOOP2;
                        case '}':
                            this._error = "illegal '}' position";
                            break;
                        case '\n':
                            this._lineCount++;
                        default:
                            break;
                    }
                }
                if (!ok) {
                    this._error = "':' not found";
                    return null;
                }
                const value = this.parseValue(buffer, length, i, localRetEndPos2);
                if (this._error) {
                    return null;
                }
                i = localRetEndPos2[0];
                ret.put(key, value);
                FOR_LOOP3: for (; i < length; i++) {
                    c = buffer[i];
                    switch (c) {
                        case ',':
                            break FOR_LOOP3;
                        case '}':
                            outEndPos[0] = i + 1;
                            return ret;
                        case '\n':
                            this._lineCount++;
                        default:
                            break;
                    }
                }
            }
            this._error = 'illegal end of perseObject';
            return null;
        }
        parseArray(buffer, length, begin, outEndPos) {
            if (this._error) {
                return null;
            }
            if (!buffer) {
                this._error = 'buffer is null';
                return null;
            }
            let ret = new JsonArray();
            let i = begin;
            let c;
            const localRetEndpos2 = new Array(1);
            for (; i < length; i++) {
                const value = this.parseValue(buffer, length, i, localRetEndpos2);
                if (this._error) {
                    return null;
                }
                i = localRetEndpos2[0];
                if (value) {
                    ret.add(value);
                }
                FOR_LOOP: for (; i < length; i++) {
                    c = buffer[i];
                    switch (c) {
                        case ',':
                            break FOR_LOOP;
                        case ']':
                            outEndPos[0] = i + 1;
                            return ret;
                        case '\n':
                            ++this._lineCount;
                        default:
                            break;
                    }
                }
            }
            ret = void 0;
            this._error = 'illegal end of parseObject';
            return null;
        }
    }
    exports.CubismJson = CubismJson;
    class JsonFloat extends Value {
        constructor(v) {
            super();
            this._value = v;
        }
        isFloat() {
            return true;
        }
        getString(defaultValue, indent) {
            const strbuf = '\0';
            this._value = parseFloat(strbuf);
            this._stringBuffer = strbuf;
            return this._stringBuffer;
        }
        toInt(defaultValue = 0) {
            return parseInt(this._value.toString());
        }
        toFloat(defaultValue = 0.0) {
            return this._value;
        }
        equals(value) {
            if ('number' === typeof value) {
                if (Math.round(value)) {
                    return false;
                }
                else {
                    return value == this._value;
                }
            }
            return false;
        }
    }
    exports.JsonFloat = JsonFloat;
    class JsonBoolean extends Value {
        isBool() {
            return true;
        }
        toBoolean(defaultValue = false) {
            return this._boolValue;
        }
        getString(defaultValue, indent) {
            this._stringBuffer = this._boolValue ? 'true' : 'false';
            return this._stringBuffer;
        }
        equals(value) {
            if ('boolean' === typeof value) {
                return value == this._boolValue;
            }
            return false;
        }
        isStatic() {
            return true;
        }
        constructor(v) {
            super();
            this._boolValue = v;
        }
    }
    exports.JsonBoolean = JsonBoolean;
    class JsonString extends Value {
        constructor(s) {
            super();
            this._stringBuffer = s;
        }
        isString() {
            return true;
        }
        getString(defaultValue, indent) {
            return this._stringBuffer;
        }
        equals(value) {
            if ('string' === typeof value) {
                return this._stringBuffer == value;
            }
            return false;
        }
    }
    exports.JsonString = JsonString;
    class JsonError extends JsonString {
        isStatic() {
            return this._isStatic;
        }
        setErrorNotForClientCall(s) {
            this._stringBuffer = s;
            return this;
        }
        constructor(s, isStatic) {
            if ('string' === typeof s) {
                super(s);
            }
            else {
                super(s);
            }
            this._isStatic = isStatic;
        }
        isError() {
            return true;
        }
    }
    exports.JsonError = JsonError;
    class JsonNullvalue extends Value {
        isNull() {
            return true;
        }
        getString(defaultValue, indent) {
            return this._stringBuffer;
        }
        isStatic() {
            return true;
        }
        setErrorNotForClientCall(s) {
            this._stringBuffer = s;
            return JsonError.nullValue;
        }
        constructor() {
            super();
            this._stringBuffer = 'NullValue';
        }
    }
    exports.JsonNullvalue = JsonNullvalue;
    class JsonArray extends Value {
        constructor() {
            super();
            this._array = new Array();
        }
        release() {
            for (let i = 0; i < this._array.length; i++) {
                let v = this._array[i];
                if (v && !v.isStatic()) {
                    v = void 0;
                    v = null;
                }
            }
        }
        isArray() {
            return true;
        }
        getValueByIndex(index) {
            if (index < 0 || this._array.length <= index) {
                return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_INDEX_OF_BOUNDS);
            }
            const v = this._array[index];
            if (v == null) {
                return Value.nullValue;
            }
            return v;
        }
        getValueByString(s) {
            return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
        }
        getString(defaultValue, indent) {
            const stringBuffer = indent + '[\n';
            for (let i = 0; i < this._array.length; i++) {
                const v = this._array[i];
                this._stringBuffer += indent + '' + v.getString(indent + ' ') + '\n';
            }
            this._stringBuffer = stringBuffer + indent + ']\n';
            return this._stringBuffer;
        }
        add(v) {
            this._array.push(v);
        }
        getVector(defaultValue = null) {
            return this._array;
        }
        getSize() {
            return this._array.length;
        }
    }
    exports.JsonArray = JsonArray;
    class JsonMap extends Value {
        constructor() {
            super();
            this._map = new Map();
        }
        release() {
            this._map.clear();
        }
        isMap() {
            return true;
        }
        getValueByString(s) {
            const ret = this._map.get(s);
            if (ret != undefined) {
                return ret;
            }
            return Value.nullValue;
        }
        getValueByIndex(index) {
            return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
        }
        getString(defaultValue, indent) {
            this._stringBuffer = indent + '{\n';
            for (const element of this._map) {
                const key = element[0];
                const v = element[1];
                this._stringBuffer +=
                    indent + ' ' + key + ' : ' + v.getString(indent + '   ') + ' \n';
            }
            this._stringBuffer += indent + '}\n';
            return this._stringBuffer;
        }
        getMap(defaultValue) {
            return this._map;
        }
        put(key, v) {
            this._map.set(key, v);
        }
        getKeys() {
            if (!this._keys) {
                this._keys = [...this._map.keys()];
            }
            return this._keys;
        }
        getSize() {
            return this._keys.length;
        }
    }
    exports.JsonMap = JsonMap;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismJson = $.CubismJson;
        Live2DCubismFramework.JsonArray = $.JsonArray;
        Live2DCubismFramework.JsonBoolean = $.JsonBoolean;
        Live2DCubismFramework.JsonError = $.JsonError;
        Live2DCubismFramework.JsonFloat = $.JsonFloat;
        Live2DCubismFramework.JsonMap = $.JsonMap;
        Live2DCubismFramework.JsonNullvalue = $.JsonNullvalue;
        Live2DCubismFramework.JsonString = $.JsonString;
        Live2DCubismFramework.Value = $.Value;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/live2dcubismframework", ["require", "exports", "framework/src/id/cubismidmanager", "framework/src/rendering/cubismrenderer", "framework/src/utils/cubismdebug", "framework/src/utils/cubismjson", "framework/src/live2dcubismframework"], function (require, exports, cubismidmanager_1, cubismrenderer_4, cubismdebug_6, cubismjson_2, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.LogLevel = exports.Option = exports.CubismFramework = exports.Constant = void 0;
    exports.strtod = strtod;
    exports.csmDelete = csmDelete;
    function strtod(s, endPtr) {
        let index = 0;
        for (let i = 1;; i++) {
            const testC = s.slice(i - 1, i);
            if (testC == 'e' || testC == '-' || testC == 'E') {
                continue;
            }
            const test = s.substring(0, i);
            const number = Number(test);
            if (isNaN(number)) {
                break;
            }
            index = i;
        }
        let d = parseFloat(s);
        if (isNaN(d)) {
            d = NaN;
        }
        endPtr[0] = s.slice(index);
        return d;
    }
    let s_isStarted = false;
    let s_isInitialized = false;
    let s_option = null;
    let s_cubismIdManager = null;
    exports.Constant = Object.freeze({
        vertexOffset: 0,
        vertexStep: 2
    });
    function csmDelete(address) {
        if (!address) {
            return;
        }
        address = void 0;
    }
    class CubismFramework {
        static startUp(option = null) {
            if (s_isStarted) {
                (0, cubismdebug_6.CubismLogInfo)('CubismFramework.startUp() is already done.');
                return s_isStarted;
            }
            s_option = option;
            if (s_option != null) {
                Live2DCubismCore.Logging.csmSetLogFunction(s_option.logFunction);
            }
            s_isStarted = true;
            if (s_isStarted) {
                const version = Live2DCubismCore.Version.csmGetVersion();
                const major = (version & 0xff000000) >> 24;
                const minor = (version & 0x00ff0000) >> 16;
                const patch = version & 0x0000ffff;
                const versionNumber = version;
                (0, cubismdebug_6.CubismLogInfo)(`Live2D Cubism Core version: {0}.{1}.{2} ({3})`, ('00' + major).slice(-2), ('00' + minor).slice(-2), ('0000' + patch).slice(-4), versionNumber);
            }
            (0, cubismdebug_6.CubismLogInfo)('CubismFramework.startUp() is complete.');
            return s_isStarted;
        }
        static cleanUp() {
            s_isStarted = false;
            s_isInitialized = false;
            s_option = null;
            s_cubismIdManager = null;
        }
        static initialize(memorySize = 0) {
            (0, cubismdebug_6.CSM_ASSERT)(s_isStarted);
            if (!s_isStarted) {
                (0, cubismdebug_6.CubismLogWarning)('CubismFramework is not started.');
                return;
            }
            if (s_isInitialized) {
                (0, cubismdebug_6.CubismLogWarning)('CubismFramework.initialize() skipped, already initialized.');
                return;
            }
            cubismjson_2.Value.staticInitializeNotForClientCall();
            s_cubismIdManager = new cubismidmanager_1.CubismIdManager();
            Live2DCubismCore.Memory.initializeAmountOfMemory(memorySize);
            s_isInitialized = true;
            (0, cubismdebug_6.CubismLogInfo)('CubismFramework.initialize() is complete.');
        }
        static dispose() {
            (0, cubismdebug_6.CSM_ASSERT)(s_isStarted);
            if (!s_isStarted) {
                (0, cubismdebug_6.CubismLogWarning)('CubismFramework is not started.');
                return;
            }
            if (!s_isInitialized) {
                (0, cubismdebug_6.CubismLogWarning)('CubismFramework.dispose() skipped, not initialized.');
                return;
            }
            cubismjson_2.Value.staticReleaseNotForClientCall();
            s_cubismIdManager.release();
            s_cubismIdManager = null;
            cubismrenderer_4.CubismRenderer.staticRelease();
            s_isInitialized = false;
            (0, cubismdebug_6.CubismLogInfo)('CubismFramework.dispose() is complete.');
        }
        static isStarted() {
            return s_isStarted;
        }
        static isInitialized() {
            return s_isInitialized;
        }
        static coreLogFunction(message) {
            if (!Live2DCubismCore.Logging.csmGetLogFunction()) {
                return;
            }
            Live2DCubismCore.Logging.csmGetLogFunction()(message);
        }
        static getLoggingLevel() {
            if (s_option != null) {
                return s_option.loggingLevel;
            }
            return LogLevel.LogLevel_Off;
        }
        static getIdManager() {
            return s_cubismIdManager;
        }
        constructor() { }
    }
    exports.CubismFramework = CubismFramework;
    class Option {
    }
    exports.Option = Option;
    var LogLevel;
    (function (LogLevel) {
        LogLevel[LogLevel["LogLevel_Verbose"] = 0] = "LogLevel_Verbose";
        LogLevel[LogLevel["LogLevel_Debug"] = 1] = "LogLevel_Debug";
        LogLevel[LogLevel["LogLevel_Info"] = 2] = "LogLevel_Info";
        LogLevel[LogLevel["LogLevel_Warning"] = 3] = "LogLevel_Warning";
        LogLevel[LogLevel["LogLevel_Error"] = 4] = "LogLevel_Error";
        LogLevel[LogLevel["LogLevel_Off"] = 5] = "LogLevel_Off";
    })(LogLevel || (exports.LogLevel = LogLevel = {}));
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.Constant = $.Constant;
        Live2DCubismFramework.csmDelete = $.csmDelete;
        Live2DCubismFramework.CubismFramework = $.CubismFramework;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("src/core", ["require", "exports", "framework/src/live2dcubismframework", "src/boot", "src/boot"], function (require, exports, live2dcubismframework_5, boot_2, boot_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_CORE_URLS = exports.webglSupport = exports.onLog = exports.log = void 0;
    exports.loadCore = loadCore;
    exports.coreLoaded = coreLoaded;
    Object.defineProperty(exports, "log", { enumerable: true, get: function () { return boot_3.log; } });
    Object.defineProperty(exports, "onLog", { enumerable: true, get: function () { return boot_3.onLog; } });
    Object.defineProperty(exports, "webglSupport", { enumerable: true, get: function () { return boot_3.webglSupport; } });
    Object.defineProperty(exports, "DEFAULT_CORE_URLS", { enumerable: true, get: function () { return boot_3.DEFAULT_CORE_URLS; } });
    let frameworkReady = false;
    async function loadCore(urls = boot_2.DEFAULT_CORE_URLS) {
        const info = await (0, boot_2.loadCoreScript)(urls);
        if (!frameworkReady) {
            const opt = new live2dcubismframework_5.Option();
            opt.logFunction = (m) => (0, boot_2.log)('info', m.trim());
            opt.loggingLevel = live2dcubismframework_5.LogLevel.LogLevel_Warning;
            live2dcubismframework_5.CubismFramework.startUp(opt);
            live2dcubismframework_5.CubismFramework.initialize();
            frameworkReady = true;
        }
        return info;
    }
    function coreLoaded() {
        return frameworkReady;
    }
});
define("src/assets", ["require", "exports", "src/core"], function (require, exports, core_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sharedAssets = exports.Live2DAssetManager = void 0;
    class Live2DAssetManager {
        constructor() {
            this.errors = [];
            this.buffers = new Map();
            this.images = new Map();
            this.listeners = [];
        }
        onError(fn) {
            this.listeners.push(fn);
            return () => {
                this.listeners = this.listeners.filter((f) => f !== fn);
            };
        }
        fail(url, status, message) {
            const e = { url, status, message, time: Date.now() };
            this.errors.push(e);
            if (this.errors.length > 200)
                this.errors.shift();
            (0, core_1.log)('error', `资源加载失败 ${url}：${message}`);
            for (const f of this.listeners)
                f(e);
            return new Error(`${message}（${url}）`);
        }
        fetchBuffer(url) {
            const hit = this.buffers.get(url);
            if (hit)
                return hit;
            const p = (async () => {
                let res;
                try {
                    res = await fetch(url);
                }
                catch (e) {
                    throw this.fail(url, 0, '网络错误');
                }
                if (!res.ok)
                    throw this.fail(url, res.status, `HTTP ${res.status}`);
                const buf = await res.arrayBuffer();
                if (!buf.byteLength)
                    throw this.fail(url, res.status, '文件为空');
                return buf;
            })();
            this.buffers.set(url, p);
            p.catch(() => this.buffers.delete(url));
            return p;
        }
        loadImage(url) {
            const hit = this.images.get(url);
            if (hit)
                return hit;
            const p = new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => reject(this.fail(url, 0, '贴图无法解码或不存在'));
                img.src = url;
            });
            this.images.set(url, p);
            p.catch(() => this.images.delete(url));
            return p;
        }
        async createTexture(gl, url) {
            const img = await this.loadImage(url);
            if (gl.isContextLost())
                throw new Error('WebGL 上下文已丢失');
            const tex = gl.createTexture();
            if (!tex)
                throw this.fail(url, 0, '创建贴图失败');
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
            gl.bindTexture(gl.TEXTURE_2D, null);
            return tex;
        }
        evict(prefix) {
            for (const k of [...this.buffers.keys()])
                if (k.startsWith(prefix))
                    this.buffers.delete(k);
            for (const k of [...this.images.keys()])
                if (k.startsWith(prefix))
                    this.images.delete(k);
        }
        stats() {
            return { buffers: this.buffers.size, images: this.images.size, errors: this.errors.length };
        }
    }
    exports.Live2DAssetManager = Live2DAssetManager;
    exports.sharedAssets = new Live2DAssetManager();
});
define("framework/src/rendering/cubismrendertarget_webgl", ["require", "exports", "framework/src/utils/cubismdebug", "framework/src/rendering/cubismrendertarget_webgl"], function (require, exports, cubismdebug_7, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismRenderTarget_WebGL = void 0;
    class CubismRenderTarget_WebGL {
        static copyBuffer(gl, src, dst) {
            if (src == null || dst == null) {
                return;
            }
            if (!(gl instanceof WebGL2RenderingContext)) {
                throw new Error('WebGL2RenderingContext is required for buffer copy.');
            }
            const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.getRenderTexture());
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.getRenderTexture());
            gl.blitFramebuffer(0, 0, src.getBufferWidth(), src.getBufferHeight(), 0, 0, dst.getBufferWidth(), dst.getBufferHeight(), gl.COLOR_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        }
        beginDraw(restoreFbo = null) {
            if (this._renderTexture == null) {
                console.error('_renderTexture is null');
                return;
            }
            if (restoreFbo == null) {
                this._oldFbo = this._gl.getParameter(this._gl.FRAMEBUFFER_BINDING);
            }
            else {
                this._oldFbo = restoreFbo;
            }
            this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._renderTexture);
        }
        endDraw() {
            this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._oldFbo);
        }
        clear(r, g, b, a) {
            this._gl.clearColor(r, g, b, a);
            this._gl.clear(this._gl.COLOR_BUFFER_BIT);
        }
        createRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
            this.destroyRenderTarget();
            this._colorBuffer = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._colorBuffer);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, displayBufferWidth, displayBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.bindTexture(gl.TEXTURE_2D, null);
            const ret = gl.createFramebuffer();
            if (ret == null) {
                (0, cubismdebug_7.CubismLogError)('Failed to create framebuffer');
                return false;
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, ret);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._colorBuffer, 0);
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                (0, cubismdebug_7.CubismLogError)('Framebuffer is not complete');
                gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
                gl.deleteFramebuffer(ret);
                this.destroyRenderTarget();
                return false;
            }
            this._renderTexture = ret;
            this._bufferWidth = displayBufferWidth;
            this._bufferHeight = displayBufferHeight;
            this._gl = gl;
            return true;
        }
        destroyRenderTarget() {
            if (this._colorBuffer) {
                this._gl.bindTexture(this._gl.TEXTURE_2D, null);
                this._gl.deleteTexture(this._colorBuffer);
                this._colorBuffer = null;
            }
            if (this._renderTexture) {
                this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
                this._gl.deleteFramebuffer(this._renderTexture);
                this._renderTexture = null;
            }
        }
        getGL() {
            return this._gl;
        }
        getRenderTexture() {
            return this._renderTexture;
        }
        getColorBuffer() {
            return this._colorBuffer;
        }
        getBufferWidth() {
            return this._bufferWidth;
        }
        getBufferHeight() {
            return this._bufferHeight;
        }
        isValid() {
            return this._renderTexture != null;
        }
        getOldFBO() {
            return this._oldFbo;
        }
        constructor() {
            this._gl = null;
            this._colorBuffer = null;
            this._renderTexture = null;
            this._bufferWidth = 0;
            this._bufferHeight = 0;
            this._oldFbo = null;
        }
    }
    exports.CubismRenderTarget_WebGL = CubismRenderTarget_WebGL;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismOffscreenSurface_WebGL = $.CubismRenderTarget_WebGL;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/utils/cubismarrayutils", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.updateSize = updateSize;
    function updateSize(curArray, newSize, value = null, callPlacementNew = null) {
        const curSize = curArray.length;
        if (curSize < newSize) {
            if (callPlacementNew) {
                for (let i = curArray.length; i < newSize; i++) {
                    if (typeof value == 'function') {
                        curArray[i] = JSON.parse(JSON.stringify(new value()));
                    }
                    else {
                        curArray[i] = value;
                    }
                }
            }
            else {
                for (let i = curArray.length; i < newSize; i++) {
                    curArray[i] = value;
                }
            }
        }
        else {
            curArray.length = newSize;
        }
    }
});
define("framework/src/rendering/cubismoffscreenmanager", ["require", "exports", "framework/src/utils/cubismarrayutils", "framework/src/utils/cubismdebug", "framework/src/rendering/cubismrendertarget_webgl"], function (require, exports, cubismarrayutils_1, cubismdebug_8, cubismrendertarget_webgl_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CubismWebGLOffscreenManager = void 0;
    class CubismRenderTargetContainer {
        constructor(colorBuffer = null, renderTexture = null, inUse = false) {
            this.colorBuffer = colorBuffer;
            this.renderTexture = renderTexture;
            this.inUse = inUse;
        }
        clear() {
            this.colorBuffer = null;
            this.renderTexture = null;
            this.inUse = false;
        }
        getColorBuffer() {
            return this.colorBuffer;
        }
        getRenderTexture() {
            return this.renderTexture;
        }
    }
    class CubismWebGLContextManager {
        constructor(gl) {
            this.gl = gl;
            this.offscreenRenderTargetContainers =
                new Array();
            this.previousActiveRenderTextureMaxCount = 0;
            this.currentActiveRenderTextureCount = 0;
            this.hasResetThisFrame = false;
            this.width = 0;
            this.height = 0;
        }
        release() {
            if (this.offscreenRenderTargetContainers != null) {
                for (let index = 0; index < this.offscreenRenderTargetContainers.length; ++index) {
                    const container = this.offscreenRenderTargetContainers[index];
                    this.gl.deleteTexture(container.colorBuffer);
                    this.gl.deleteFramebuffer(container.renderTexture);
                }
                this.offscreenRenderTargetContainers.length = 0;
                this.offscreenRenderTargetContainers = null;
            }
        }
    }
    class CubismWebGLOffscreenManager {
        constructor() {
            this._contextManagers = new Map();
        }
        release() {
            if (this._contextManagers != null) {
                for (const manager of this._contextManagers.values()) {
                    manager.release();
                }
                this._contextManagers.clear();
                this._contextManagers = null;
            }
            CubismWebGLOffscreenManager._instance = null;
        }
        static getInstance() {
            if (this._instance == null) {
                this._instance = new CubismWebGLOffscreenManager();
            }
            return this._instance;
        }
        getContextManager(gl) {
            if (!this._contextManagers.has(gl)) {
                this._contextManagers.set(gl, new CubismWebGLContextManager(gl));
            }
            return this._contextManagers.get(gl);
        }
        removeContext(gl) {
            if (this._contextManagers.has(gl)) {
                const manager = this._contextManagers.get(gl);
                manager.release();
                this._contextManagers.delete(gl);
            }
        }
        initialize(gl, width, height) {
            const contextManager = this.getContextManager(gl);
            if (contextManager.offscreenRenderTargetContainers != null) {
                for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
                    const container = contextManager.offscreenRenderTargetContainers[index];
                    contextManager.gl.deleteTexture(container.colorBuffer);
                    contextManager.gl.deleteFramebuffer(container.renderTexture);
                    container.clear();
                }
                contextManager.offscreenRenderTargetContainers.length = 0;
            }
            else {
                contextManager.offscreenRenderTargetContainers =
                    new Array();
            }
            contextManager.width = width;
            contextManager.height = height;
            contextManager.previousActiveRenderTextureMaxCount = 0;
            contextManager.currentActiveRenderTextureCount = 0;
            contextManager.hasResetThisFrame = false;
        }
        beginFrameProcess(gl) {
            const contextManager = this.getContextManager(gl);
            if (contextManager.hasResetThisFrame) {
                return;
            }
            contextManager.previousActiveRenderTextureMaxCount = 0;
            contextManager.hasResetThisFrame = true;
        }
        endFrameProcess(gl) {
            const contextManager = this.getContextManager(gl);
            contextManager.hasResetThisFrame = false;
        }
        getContainerSize(gl) {
            const contextManager = this.getContextManager(gl);
            if (contextManager.offscreenRenderTargetContainers == null) {
                return 0;
            }
            return contextManager.offscreenRenderTargetContainers.length;
        }
        getOffscreenRenderTargetContainers(gl, width, height, previousFramebuffer) {
            const contextManager = this.getContextManager(gl);
            if (contextManager.width != width ||
                contextManager.height != height ||
                contextManager.offscreenRenderTargetContainers == null) {
                this.initialize(gl, width, height);
            }
            this.updateRenderTargetContainerCount(gl);
            const container = this.getUnusedOffscreenRenderTargetContainer(gl);
            if (container != null) {
                return container;
            }
            const offscreenRenderTextureContainer = this.createOffscreenRenderTargetContainer(gl, width, height, previousFramebuffer);
            return offscreenRenderTextureContainer;
        }
        getUsingRenderTextureState(gl, renderTexture) {
            const contextManager = this.getContextManager(gl);
            for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
                if (contextManager.offscreenRenderTargetContainers[index].renderTexture ==
                    renderTexture) {
                    return contextManager.offscreenRenderTargetContainers[index].inUse;
                }
            }
            return true;
        }
        startUsingRenderTexture(gl, renderTexture) {
            const contextManager = this.getContextManager(gl);
            for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
                if (contextManager.offscreenRenderTargetContainers[index].renderTexture !=
                    renderTexture) {
                    continue;
                }
                contextManager.offscreenRenderTargetContainers[index].inUse = true;
                this.updateRenderTargetContainerCount(gl);
                break;
            }
        }
        stopUsingRenderTexture(gl, renderTexture) {
            const contextManager = this.getContextManager(gl);
            for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
                if (contextManager.offscreenRenderTargetContainers[index].renderTexture !=
                    renderTexture) {
                    continue;
                }
                contextManager.offscreenRenderTargetContainers[index].inUse = false;
                contextManager.currentActiveRenderTextureCount--;
                if (contextManager.currentActiveRenderTextureCount < 0) {
                    contextManager.currentActiveRenderTextureCount = 0;
                }
                break;
            }
        }
        stopUsingAllRenderTextures(gl) {
            const contextManager = this.getContextManager(gl);
            for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
                contextManager.offscreenRenderTargetContainers[index].inUse = false;
            }
            contextManager.currentActiveRenderTextureCount = 0;
        }
        releaseStaleRenderTextures(gl) {
            const contextManager = this.getContextManager(gl);
            const listSize = contextManager.offscreenRenderTargetContainers.length;
            if (contextManager.hasResetThisFrame || listSize === 0) {
                return;
            }
            let findPos = 0;
            let resize = contextManager.previousActiveRenderTextureMaxCount;
            for (let i = listSize; contextManager.previousActiveRenderTextureMaxCount < i; --i) {
                const index = i - 1;
                if (contextManager.offscreenRenderTargetContainers[index].inUse) {
                    let isFind = false;
                    for (; findPos < contextManager.previousActiveRenderTextureMaxCount; ++findPos) {
                        if (!contextManager.offscreenRenderTargetContainers[findPos].inUse) {
                            const tempContainer = contextManager.offscreenRenderTargetContainers[findPos];
                            contextManager.offscreenRenderTargetContainers[findPos] =
                                contextManager.offscreenRenderTargetContainers[index];
                            contextManager.offscreenRenderTargetContainers[findPos].inUse =
                                true;
                            contextManager.offscreenRenderTargetContainers[index] =
                                tempContainer;
                            contextManager.offscreenRenderTargetContainers[index].inUse = false;
                            isFind = true;
                            break;
                        }
                    }
                    if (!isFind) {
                        resize = i;
                        break;
                    }
                }
                const container = contextManager.offscreenRenderTargetContainers[index];
                contextManager.gl.bindTexture(contextManager.gl.TEXTURE_2D, null);
                contextManager.gl.deleteTexture(container.colorBuffer);
                contextManager.gl.bindFramebuffer(contextManager.gl.FRAMEBUFFER, null);
                contextManager.gl.deleteFramebuffer(container.renderTexture);
                container.clear();
            }
            (0, cubismarrayutils_1.updateSize)(contextManager.offscreenRenderTargetContainers, resize);
        }
        getPreviousActiveRenderTextureCount(gl) {
            const contextManager = this.getContextManager(gl);
            return contextManager.previousActiveRenderTextureMaxCount;
        }
        getCurrentActiveRenderTextureCount(gl) {
            const contextManager = this.getContextManager(gl);
            return contextManager.currentActiveRenderTextureCount;
        }
        updateRenderTargetContainerCount(gl) {
            const contextManager = this.getContextManager(gl);
            ++contextManager.currentActiveRenderTextureCount;
            contextManager.previousActiveRenderTextureMaxCount =
                contextManager.currentActiveRenderTextureCount >
                    contextManager.previousActiveRenderTextureMaxCount
                    ? contextManager.currentActiveRenderTextureCount
                    : contextManager.previousActiveRenderTextureMaxCount;
        }
        getUnusedOffscreenRenderTargetContainer(gl) {
            const contextManager = this.getContextManager(gl);
            for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
                const container = contextManager.offscreenRenderTargetContainers[index];
                if (container.inUse == false) {
                    container.inUse = true;
                    return container;
                }
            }
            return null;
        }
        createOffscreenRenderTargetContainer(gl, width, height, previousFramebuffer) {
            const renderTarget = new cubismrendertarget_webgl_1.CubismRenderTarget_WebGL();
            if (!renderTarget.createRenderTarget(gl, width, height, previousFramebuffer)) {
                (0, cubismdebug_8.CubismLogError)('Failed to create offscreen render texture.');
                return null;
            }
            const offscreenRenderTextureContainer = new CubismRenderTargetContainer(renderTarget.getColorBuffer(), renderTarget.getRenderTexture(), true);
            const contextManager = this.getContextManager(gl);
            contextManager.offscreenRenderTargetContainers.push(offscreenRenderTextureContainer);
            return offscreenRenderTextureContainer;
        }
    }
    exports.CubismWebGLOffscreenManager = CubismWebGLOffscreenManager;
});
define("framework/src/rendering/cubismoffscreenrendertarget_webgl", ["require", "exports", "framework/src/rendering/cubismrendertarget_webgl", "framework/src/rendering/cubismoffscreenmanager", "framework/src/utils/cubismdebug"], function (require, exports, cubismrendertarget_webgl_2, cubismoffscreenmanager_1, cubismdebug_9) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CubismOffscreenRenderTarget_WebGL = void 0;
    class CubismOffscreenRenderTarget_WebGL extends cubismrendertarget_webgl_2.CubismRenderTarget_WebGL {
        initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight) {
            this._gl = gl;
            this._webGLOffscreenManager = cubismoffscreenmanager_1.CubismWebGLOffscreenManager.getInstance();
            if (this._webGLOffscreenManager.getContainerSize(gl) === 0) {
                this._webGLOffscreenManager.initialize(gl, displayBufferWidth, displayBufferHeight);
            }
        }
        setOffscreenRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
            if (this._webGLOffscreenManager == null) {
                this.initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight);
            }
            const offscreenRenderTargetContainer = this._webGLOffscreenManager.getOffscreenRenderTargetContainers(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer);
            if (offscreenRenderTargetContainer == null) {
                (0, cubismdebug_9.CubismLogError)('Failed to acquire offscreen render texture container.');
                return;
            }
            this._colorBuffer = offscreenRenderTargetContainer.getColorBuffer();
            this._renderTexture = offscreenRenderTargetContainer.getRenderTexture();
            this._bufferWidth = displayBufferWidth;
            this._bufferHeight = displayBufferHeight;
            this._gl = gl;
            if (this._renderTexture == null) {
                this._renderTexture = previousFramebuffer;
                (0, cubismdebug_9.CubismLogError)('Failed to create offscreen render texture.');
            }
            return;
        }
        getUsingRenderTextureState() {
            if (this._webGLOffscreenManager == null || this._gl == null) {
                return true;
            }
            return this._webGLOffscreenManager.getUsingRenderTextureState(this._gl, this._renderTexture);
        }
        startUsingRenderTexture() {
            if (this._webGLOffscreenManager == null || this._gl == null) {
                return;
            }
            this._webGLOffscreenManager.startUsingRenderTexture(this._gl, this._renderTexture);
        }
        stopUsingRenderTexture() {
            if (this._webGLOffscreenManager == null || this._gl == null) {
                return;
            }
            this._webGLOffscreenManager.stopUsingRenderTexture(this._gl, this._renderTexture);
        }
        setOffscreenIndex(offscreenIndex) {
            this._offscreenIndex = offscreenIndex;
        }
        getOffscreenIndex() {
            return this._offscreenIndex;
        }
        setOldOffscreen(oldOffscreen) {
            this._oldOffscreen = oldOffscreen;
        }
        getOldOffscreen() {
            return this._oldOffscreen;
        }
        setParentPartOffscreen(parentOffscreenRenderTarget) {
            this._parentOffscreenRenderTarget = parentOffscreenRenderTarget;
        }
        getParentPartOffscreen() {
            return this._parentOffscreenRenderTarget;
        }
        constructor() {
            super();
            this._offscreenIndex = -1;
            this._parentOffscreenRenderTarget = null;
            this._oldOffscreen = null;
            this._webGLOffscreenManager = null;
        }
        release() {
            if (this._webGLOffscreenManager != null &&
                this._gl != null &&
                this._renderTexture != null) {
                this._webGLOffscreenManager.stopUsingRenderTexture(this._gl, this._renderTexture);
            }
            if (this._colorBuffer && this._gl) {
                this._gl.deleteTexture(this._colorBuffer);
                this._colorBuffer = null;
            }
            if (this._renderTexture && this._gl) {
                this._gl.deleteFramebuffer(this._renderTexture);
                this._renderTexture = null;
            }
            if (this._webGLOffscreenManager != null) {
                this._webGLOffscreenManager = null;
            }
            this._oldOffscreen = null;
            this._parentOffscreenRenderTarget = null;
        }
    }
    exports.CubismOffscreenRenderTarget_WebGL = CubismOffscreenRenderTarget_WebGL;
});
define("framework/src/rendering/cubismrenderer_webgl", ["require", "exports", "framework/src/model/cubismmodel", "framework/src/utils/cubismdebug", "framework/src/utils/cubismarrayutils", "framework/src/rendering/cubismclippingmanager", "framework/src/rendering/cubismrenderer", "framework/src/rendering/cubismshader_webgl", "framework/src/rendering/cubismrenderer_webgl", "framework/src/rendering/cubismrendertarget_webgl", "framework/src/rendering/cubismoffscreenrendertarget_webgl"], function (require, exports, cubismmodel_2, cubismdebug_10, cubismarrayutils_2, cubismclippingmanager_1, cubismrenderer_5, cubismshader_webgl_1, $, cubismrendertarget_webgl_3, cubismoffscreenrendertarget_webgl_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismRenderer_WebGL = exports.CubismRendererProfile_WebGL = exports.CubismClippingContext_WebGL = exports.CubismClippingManager_WebGL = void 0;
    const s_invalidValue = -1;
    const s_renderTargetIndexArray = new Uint16Array([
        0, 1, 2, 2, 1, 3
    ]);
    class CubismClippingManager_WebGL extends cubismclippingmanager_1.CubismClippingManager {
        setGL(gl) {
            this.gl = gl;
        }
        constructor() {
            super(CubismClippingContext_WebGL);
        }
        setupClippingContext(model, renderer, lastFbo, lastViewport, drawObjectType) {
            let usingClipCount = 0;
            for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
                const cc = this._clippingContextListForMask[clipIndex];
                switch (drawObjectType) {
                    case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable:
                    default:
                        this.calcClippedDrawableTotalBounds(model, cc);
                        break;
                    case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen:
                        this.calcClippedOffscreenTotalBounds(model, cc);
                        break;
                }
                if (cc._isUsing) {
                    usingClipCount++;
                }
            }
            if (usingClipCount <= 0) {
                return;
            }
            this.gl.viewport(0, 0, this._clippingMaskBufferSize, this._clippingMaskBufferSize);
            switch (drawObjectType) {
                case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable:
                default:
                    this._currentMaskBuffer = renderer.getDrawableMaskBuffer(0);
                    break;
                case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen:
                    this._currentMaskBuffer = renderer.getOffscreenMaskBuffer(0);
                    break;
            }
            this._currentMaskBuffer.beginDraw(lastFbo);
            renderer.preDraw();
            this.setupLayoutBounds(usingClipCount);
            if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
                this._clearedMaskBufferFlags.length = 0;
                this._clearedMaskBufferFlags = new Array(this._renderTextureCount);
                for (let i = 0; i < this._clearedMaskBufferFlags.length; i++) {
                    this._clearedMaskBufferFlags[i] = false;
                }
            }
            for (let index = 0; index < this._clearedMaskBufferFlags.length; index++) {
                this._clearedMaskBufferFlags[index] = false;
            }
            for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
                const clipContext = this._clippingContextListForMask[clipIndex];
                const allClipedDrawRect = clipContext._allClippedDrawRect;
                const layoutBoundsOnTex01 = clipContext._layoutBounds;
                const margin = 0.05;
                let scaleX = 0;
                let scaleY = 0;
                let maskBuffer;
                switch (drawObjectType) {
                    case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable:
                    default:
                        maskBuffer = renderer.getDrawableMaskBuffer(clipContext._bufferIndex);
                        break;
                    case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen:
                        maskBuffer = renderer.getOffscreenMaskBuffer(clipContext._bufferIndex);
                        break;
                }
                if (this._currentMaskBuffer != maskBuffer) {
                    this._currentMaskBuffer.endDraw();
                    this._currentMaskBuffer = maskBuffer;
                    this._currentMaskBuffer.beginDraw(lastFbo);
                    renderer.preDraw();
                }
                this._tmpBoundsOnModel.setRect(allClipedDrawRect);
                this._tmpBoundsOnModel.expand(allClipedDrawRect.width * margin, allClipedDrawRect.height * margin);
                scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
                scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
                this.createMatrixForMask(false, layoutBoundsOnTex01, scaleX, scaleY);
                clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
                clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
                if (drawObjectType == cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen) {
                    const invertMvp = renderer.getMvpMatrix().getInvert();
                    clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
                }
                const clipDrawCount = clipContext._clippingIdCount;
                for (let i = 0; i < clipDrawCount; i++) {
                    const clipDrawIndex = clipContext._clippingIdList[i];
                    if (!model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
                        continue;
                    }
                    renderer.setIsCulling(model.getDrawableCulling(clipDrawIndex) != false);
                    if (!this._clearedMaskBufferFlags[clipContext._bufferIndex]) {
                        this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
                        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                        this._clearedMaskBufferFlags[clipContext._bufferIndex] = true;
                    }
                    renderer.setClippingContextBufferForMask(clipContext);
                    renderer.drawMeshWebGL(model, clipDrawIndex);
                }
            }
            this._currentMaskBuffer.endDraw();
            renderer.setClippingContextBufferForMask(null);
            this.gl.viewport(lastViewport[0], lastViewport[1], lastViewport[2], lastViewport[3]);
        }
        getClippingMaskCount() {
            return this._clippingContextListForMask.length;
        }
    }
    exports.CubismClippingManager_WebGL = CubismClippingManager_WebGL;
    class CubismClippingContext_WebGL extends cubismrenderer_5.CubismClippingContext {
        constructor(manager, clippingDrawableIndices, clipCount) {
            super(clippingDrawableIndices, clipCount);
            this._owner = manager;
        }
        getClippingManager() {
            return this._owner;
        }
        setGl(gl) {
            this._owner.setGL(gl);
        }
    }
    exports.CubismClippingContext_WebGL = CubismClippingContext_WebGL;
    class CubismRendererProfile_WebGL {
        setGlEnable(index, enabled) {
            if (enabled)
                this.gl.enable(index);
            else
                this.gl.disable(index);
        }
        setGlEnableVertexAttribArray(index, enabled) {
            if (enabled)
                this.gl.enableVertexAttribArray(index);
            else
                this.gl.disableVertexAttribArray(index);
        }
        save() {
            if (this.gl == null) {
                (0, cubismdebug_10.CubismLogError)("'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function.");
                return;
            }
            this._lastArrayBufferBinding = this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING);
            this._lastElementArrayBufferBinding = this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING);
            this._lastProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
            this._lastActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
            this.gl.activeTexture(this.gl.TEXTURE1);
            this._lastTexture1Binding2D = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
            this.gl.activeTexture(this.gl.TEXTURE0);
            this._lastTexture0Binding2D = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
            this._lastVertexAttribArrayEnabled[0] = this.gl.getVertexAttrib(0, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
            this._lastVertexAttribArrayEnabled[1] = this.gl.getVertexAttrib(1, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
            this._lastVertexAttribArrayEnabled[2] = this.gl.getVertexAttrib(2, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
            this._lastVertexAttribArrayEnabled[3] = this.gl.getVertexAttrib(3, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
            this._lastScissorTest = this.gl.isEnabled(this.gl.SCISSOR_TEST);
            this._lastStencilTest = this.gl.isEnabled(this.gl.STENCIL_TEST);
            this._lastDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
            this._lastCullFace = this.gl.isEnabled(this.gl.CULL_FACE);
            this._lastBlend = this.gl.isEnabled(this.gl.BLEND);
            this._lastFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);
            this._lastColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);
            this._lastBlending[0] = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
            this._lastBlending[1] = this.gl.getParameter(this.gl.BLEND_DST_RGB);
            this._lastBlending[2] = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
            this._lastBlending[3] = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);
        }
        restore() {
            if (this.gl == null) {
                (0, cubismdebug_10.CubismLogError)("'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function.");
                return;
            }
            this.gl.useProgram(this._lastProgram);
            this.setGlEnableVertexAttribArray(0, this._lastVertexAttribArrayEnabled[0]);
            this.setGlEnableVertexAttribArray(1, this._lastVertexAttribArrayEnabled[1]);
            this.setGlEnableVertexAttribArray(2, this._lastVertexAttribArrayEnabled[2]);
            this.setGlEnableVertexAttribArray(3, this._lastVertexAttribArrayEnabled[3]);
            this.setGlEnable(this.gl.SCISSOR_TEST, this._lastScissorTest);
            this.setGlEnable(this.gl.STENCIL_TEST, this._lastStencilTest);
            this.setGlEnable(this.gl.DEPTH_TEST, this._lastDepthTest);
            this.setGlEnable(this.gl.CULL_FACE, this._lastCullFace);
            this.setGlEnable(this.gl.BLEND, this._lastBlend);
            this.gl.frontFace(this._lastFrontFace);
            this.gl.colorMask(this._lastColorMask[0], this._lastColorMask[1], this._lastColorMask[2], this._lastColorMask[3]);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._lastArrayBufferBinding);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this._lastElementArrayBufferBinding);
            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture1Binding2D);
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture0Binding2D);
            this.gl.activeTexture(this._lastActiveTexture);
            this.gl.blendFuncSeparate(this._lastBlending[0], this._lastBlending[1], this._lastBlending[2], this._lastBlending[3]);
        }
        setGl(gl) {
            this.gl = gl;
        }
        constructor() {
            this._lastVertexAttribArrayEnabled = new Array(4);
            this._lastColorMask = new Array(4);
            this._lastBlending = new Array(4);
        }
    }
    exports.CubismRendererProfile_WebGL = CubismRendererProfile_WebGL;
    class CubismRenderer_WebGL extends cubismrenderer_5.CubismRenderer {
        initialize(model, maskBufferCount = 1) {
            if (model.isUsingMasking()) {
                this._drawableClippingManager = new CubismClippingManager_WebGL();
                this._drawableClippingManager.initializeForDrawable(model, maskBufferCount);
            }
            if (model.isUsingMaskingForOffscreen()) {
                this._offscreenClippingManager = new CubismClippingManager_WebGL();
                this._offscreenClippingManager.initializeForOffscreen(model, maskBufferCount);
            }
            (0, cubismarrayutils_2.updateSize)(this._sortedObjectsIndexList, model.getDrawableCount() +
                (model.getOffscreenCount ? model.getOffscreenCount() : 0), 0, true);
            (0, cubismarrayutils_2.updateSize)(this._sortedObjectsTypeList, model.getDrawableCount() +
                (model.getOffscreenCount ? model.getOffscreenCount() : 0), 0, true);
            super.initialize(model);
        }
        setupParentOffscreens(model, offscreenCount) {
            let parentOffscreen;
            for (let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex) {
                parentOffscreen = null;
                const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];
                let parentIndex = model.getPartParentPartIndices()[ownerIndex];
                while (parentIndex != cubismmodel_2.NoParentIndex) {
                    for (let i = 0; i < offscreenCount; ++i) {
                        const ownerIndex = model.getOffscreenOwnerIndices()[this._offscreenList[i].getOffscreenIndex()];
                        if (ownerIndex != parentIndex) {
                            continue;
                        }
                        parentOffscreen = this._offscreenList[i];
                        break;
                    }
                    if (parentOffscreen != null) {
                        break;
                    }
                    parentIndex = model.getPartParentPartIndices()[parentIndex];
                }
                this._offscreenList[offscreenIndex].setParentPartOffscreen(parentOffscreen);
            }
        }
        bindTexture(modelTextureNo, glTexture) {
            this._textures.set(modelTextureNo, glTexture);
        }
        getBindedTextures() {
            return this._textures;
        }
        setClippingMaskBufferSize(size) {
            if (!this._model.isUsingMasking()) {
                return;
            }
            const renderTextureCount = this._drawableClippingManager.getRenderTextureCount();
            this._drawableClippingManager.release();
            this._drawableClippingManager = void 0;
            this._drawableClippingManager = null;
            this._drawableClippingManager = new CubismClippingManager_WebGL();
            this._drawableClippingManager.setClippingMaskBufferSize(size);
            this._drawableClippingManager.initializeForDrawable(this.getModel(), renderTextureCount);
        }
        getClippingMaskBufferSize() {
            return this._model.isUsingMasking()
                ? this._drawableClippingManager.getClippingMaskBufferSize()
                : s_invalidValue;
        }
        getModelRenderTarget(index) {
            return this._modelRenderTargets[index];
        }
        getRenderTextureCount() {
            return this._model.isUsingMasking()
                ? this._drawableClippingManager.getRenderTextureCount()
                : s_invalidValue;
        }
        constructor(width, height) {
            super(width, height);
            this._clippingContextBufferForMask = null;
            this._clippingContextBufferForDraw = null;
            this._rendererProfile = new CubismRendererProfile_WebGL();
            this._textures = new Map();
            this._sortedObjectsIndexList = new Array();
            this._sortedObjectsTypeList = new Array();
            this._bufferData = {
                vertex: (WebGLBuffer = null),
                uv: (WebGLBuffer = null),
                index: (WebGLBuffer = null)
            };
            this._modelRenderTargets = new Array();
            this._drawableMasks = new Array();
            this._currentFbo = null;
            this._drawableClippingManager = null;
            this._offscreenClippingManager = null;
            this._offscreenMasks = new Array();
            this._offscreenList = new Array();
        }
        release() {
            if (this._drawableClippingManager) {
                this._drawableClippingManager.release();
                this._drawableClippingManager = void 0;
                this._drawableClippingManager = null;
            }
            if (this.gl == null) {
                return;
            }
            this.gl.deleteBuffer(this._bufferData.vertex);
            this._bufferData.vertex = null;
            this.gl.deleteBuffer(this._bufferData.uv);
            this._bufferData.uv = null;
            this.gl.deleteBuffer(this._bufferData.index);
            this._bufferData.index = null;
            this._bufferData = null;
            this._textures = null;
            for (let i = 0; i < this._modelRenderTargets.length; i++) {
                if (this._modelRenderTargets[i] != null &&
                    this._modelRenderTargets[i].isValid()) {
                    this._modelRenderTargets[i].destroyRenderTarget();
                }
            }
            this._modelRenderTargets.length = 0;
            this._modelRenderTargets = null;
            for (let i = 0; i < this._drawableMasks.length; i++) {
                if (this._drawableMasks[i] != null && this._drawableMasks[i].isValid()) {
                    this._drawableMasks[i].destroyRenderTarget();
                }
            }
            this._drawableMasks.length = 0;
            this._drawableMasks = null;
            for (let i = 0; i < this._offscreenMasks.length; i++) {
                if (this._offscreenMasks[i] != null &&
                    this._offscreenMasks[i].isValid()) {
                    this._offscreenMasks[i].destroyRenderTarget();
                }
            }
            this._offscreenMasks.length = 0;
            this._offscreenMasks = null;
            for (let i = 0; i < this._offscreenList.length; i++) {
                if (this._offscreenList[i] != null && this._offscreenList[i].isValid()) {
                    this._offscreenList[i].destroyRenderTarget();
                }
            }
            this._offscreenList.length = 0;
            this._offscreenList = null;
            this._offscreenClippingManager = null;
            this._drawableClippingManager = null;
            this._clippingContextBufferForMask = null;
            this._clippingContextBufferForDraw = null;
            this._rendererProfile = null;
            this._sortedObjectsIndexList = null;
            this._sortedObjectsTypeList = null;
            this._currentFbo = null;
            this._model = null;
            this.gl = null;
        }
        loadShaders(shaderPath = null) {
            if (this.gl == null) {
                (0, cubismdebug_10.CubismLogError)("'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function.");
                return;
            }
            if (cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance().getShader(this.gl)._shaderSets
                .length == 0 ||
                !cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance().getShader(this.gl)
                    ._isShaderLoaded) {
                const shader = cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance().getShader(this.gl);
                if (shaderPath != null) {
                    shader.setShaderPath(shaderPath);
                }
                shader.generateShaders();
            }
        }
        doDrawModel(shaderPath = null) {
            this.loadShaders(shaderPath);
            this.beforeDrawModelRenderTarget();
            const lastFbo = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
            const lastViewport = this.gl.getParameter(this.gl.VIEWPORT);
            if (this._drawableClippingManager != null) {
                this.preDraw();
                for (let i = 0; i < this._drawableClippingManager.getRenderTextureCount(); ++i) {
                    if (this._drawableMasks[i].getBufferWidth() !=
                        this._drawableClippingManager.getClippingMaskBufferSize() ||
                        this._drawableMasks[i].getBufferHeight() !=
                            this._drawableClippingManager.getClippingMaskBufferSize()) {
                        this._drawableMasks[i].createRenderTarget(this.gl, this._drawableClippingManager.getClippingMaskBufferSize(), this._drawableClippingManager.getClippingMaskBufferSize(), lastFbo);
                    }
                }
                if (this.isUsingHighPrecisionMask()) {
                    this._drawableClippingManager.setupMatrixForHighPrecision(this.getModel(), false);
                }
                else {
                    this._drawableClippingManager.setupClippingContext(this.getModel(), this, lastFbo, lastViewport, cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable);
                }
            }
            if (this._offscreenClippingManager != null) {
                this.preDraw();
                for (let i = 0; i < this._offscreenClippingManager.getRenderTextureCount(); ++i) {
                    if (this._offscreenMasks[i].getBufferWidth() !=
                        this._offscreenClippingManager.getClippingMaskBufferSize() ||
                        this._offscreenMasks[i].getBufferHeight() !=
                            this._offscreenClippingManager.getClippingMaskBufferSize()) {
                        this._offscreenMasks[i].createRenderTarget(this.gl, this._offscreenClippingManager.getClippingMaskBufferSize(), this._offscreenClippingManager.getClippingMaskBufferSize(), lastFbo);
                    }
                }
                if (this.isUsingHighPrecisionMask()) {
                    this._offscreenClippingManager.setupMatrixForOffscreenHighPrecision(this.getModel(), false, this.getMvpMatrix());
                }
                else {
                    this._offscreenClippingManager.setupClippingContext(this.getModel(), this, lastFbo, lastViewport, cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen);
                }
            }
            this.preDraw();
            this.drawObjectLoop(lastFbo);
            this.afterDrawModelRenderTarget();
        }
        drawObjectLoop(lastFbo) {
            const model = this.getModel();
            const drawableCount = model.getDrawableCount();
            const offscreenCount = model.getOffscreenCount();
            const totalCount = drawableCount + offscreenCount;
            const renderOrder = model.getRenderOrders();
            this._currentOffscreen = null;
            this._currentFbo = lastFbo;
            this._modelRootFbo = lastFbo;
            for (let i = 0; i < totalCount; ++i) {
                const order = renderOrder[i];
                if (i < drawableCount) {
                    this._sortedObjectsIndexList[order] = i;
                    this._sortedObjectsTypeList[order] =
                        cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable;
                }
                else if (i < totalCount) {
                    this._sortedObjectsIndexList[order] = i - drawableCount;
                    this._sortedObjectsTypeList[order] =
                        cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen;
                }
            }
            for (let i = 0; i < totalCount; ++i) {
                const objectIndex = this._sortedObjectsIndexList[i];
                const objectType = this._sortedObjectsTypeList[i];
                this.renderObject(objectIndex, objectType);
            }
            while (this._currentOffscreen != null) {
                this.submitDrawToParentOffscreen(this._currentOffscreen.getOffscreenIndex(), cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen);
            }
        }
        renderObject(objectIndex, objectType) {
            switch (objectType) {
                case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable:
                    this.drawDrawable(objectIndex, this._modelRootFbo);
                    break;
                case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen:
                    this.addOffscreen(objectIndex);
                    break;
                default:
                    (0, cubismdebug_10.CubismLogError)('Unknown object type: ' + objectType);
                    break;
            }
        }
        drawDrawable(drawableIndex, rootFbo) {
            if (!this.getModel().getDrawableDynamicFlagIsVisible(drawableIndex)) {
                return;
            }
            this.submitDrawToParentOffscreen(drawableIndex, cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable);
            const clipContext = this._drawableClippingManager != null
                ? this._drawableClippingManager.getClippingContextListForDraw()[drawableIndex]
                : null;
            if (clipContext != null && this.isUsingHighPrecisionMask()) {
                if (clipContext._isUsing) {
                    this.gl.viewport(0, 0, this._drawableClippingManager.getClippingMaskBufferSize(), this._drawableClippingManager.getClippingMaskBufferSize());
                    this.preDraw();
                    this.getDrawableMaskBuffer(clipContext._bufferIndex).beginDraw(this._currentFbo);
                    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
                    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                }
                {
                    const clipDrawCount = clipContext._clippingIdCount;
                    for (let index = 0; index < clipDrawCount; index++) {
                        const clipDrawIndex = clipContext._clippingIdList[index];
                        if (!this._model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
                            continue;
                        }
                        this.setIsCulling(this._model.getDrawableCulling(clipDrawIndex) != false);
                        this.setClippingContextBufferForMask(clipContext);
                        this.drawMeshWebGL(this._model, clipDrawIndex);
                    }
                    this.getDrawableMaskBuffer(clipContext._bufferIndex).endDraw();
                    this.setClippingContextBufferForMask(null);
                    this.gl.viewport(0, 0, this._modelRenderTargetWidth, this._modelRenderTargetHeight);
                    this.preDraw();
                }
            }
            this.setClippingContextBufferForDrawable(clipContext);
            this.setIsCulling(this.getModel().getDrawableCulling(drawableIndex));
            this.drawMeshWebGL(this._model, drawableIndex);
        }
        drawMeshWebGL(model, index) {
            if (this.isCulling()) {
                this.gl.enable(this.gl.CULL_FACE);
            }
            else {
                this.gl.disable(this.gl.CULL_FACE);
            }
            this.gl.frontFace(this.gl.CCW);
            if (this.isGeneratingMask()) {
                cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance()
                    .getShader(this.gl)
                    .setupShaderProgramForMask(this, model, index);
            }
            else {
                cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance()
                    .getShader(this.gl)
                    .setupShaderProgramForDrawable(this, model, index);
            }
            if (!cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance().getShader(this.gl)
                ._isShaderLoaded) {
                return;
            }
            {
                const indexCount = model.getDrawableVertexIndexCount(index);
                this.gl.drawElements(this.gl.TRIANGLES, indexCount, this.gl.UNSIGNED_SHORT, 0);
            }
            this.gl.useProgram(null);
            this.setClippingContextBufferForDrawable(null);
            this.setClippingContextBufferForMask(null);
        }
        submitDrawToParentOffscreen(objectIndex, objectType) {
            if (this._currentOffscreen == null || objectIndex == s_invalidValue) {
                return;
            }
            const currentOwnerIndex = this.getModel().getOffscreenOwnerIndices()[this._currentOffscreen.getOffscreenIndex()];
            if (currentOwnerIndex == s_invalidValue) {
                return;
            }
            let targetParentIndex = cubismmodel_2.NoParentIndex;
            switch (objectType) {
                case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Drawable:
                    targetParentIndex =
                        this.getModel().getDrawableParentPartIndex(objectIndex);
                    break;
                case cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen:
                    targetParentIndex =
                        this.getModel().getPartParentPartIndices()[this.getModel().getOffscreenOwnerIndices()[objectIndex]];
                    break;
                default:
                    return;
            }
            while (targetParentIndex != cubismmodel_2.NoParentIndex) {
                if (targetParentIndex == currentOwnerIndex) {
                    return;
                }
                targetParentIndex =
                    this.getModel().getPartParentPartIndices()[targetParentIndex];
            }
            this.drawOffscreen(this._currentOffscreen);
            this.submitDrawToParentOffscreen(objectIndex, objectType);
        }
        addOffscreen(offscreenIndex) {
            if (this._currentOffscreen != null &&
                this._currentOffscreen.getOffscreenIndex() != offscreenIndex) {
                let isParent = false;
                const ownerIndex = this.getModel().getOffscreenOwnerIndices()[offscreenIndex];
                let parentIndex = this.getModel().getPartParentPartIndices()[ownerIndex];
                const currentOffscreenIndex = this._currentOffscreen.getOffscreenIndex();
                const currentOffscreenOwnerIndex = this.getModel().getOffscreenOwnerIndices()[currentOffscreenIndex];
                while (parentIndex != cubismmodel_2.NoParentIndex) {
                    if (parentIndex == currentOffscreenOwnerIndex) {
                        isParent = true;
                        break;
                    }
                    parentIndex = this.getModel().getPartParentPartIndices()[parentIndex];
                }
                if (!isParent) {
                    this.submitDrawToParentOffscreen(offscreenIndex, cubismrenderer_5.DrawableObjectType.DrawableObjectType_Offscreen);
                }
            }
            const offscreen = this._offscreenList[offscreenIndex];
            if (offscreen.getRenderTexture() == null ||
                offscreen.getBufferWidth() != this._modelRenderTargetWidth ||
                offscreen.getBufferHeight() != this._modelRenderTargetHeight ||
                offscreen.getUsingRenderTextureState()) {
                offscreen.setOffscreenRenderTarget(this.gl, this._modelRenderTargetWidth, this._modelRenderTargetHeight, this._currentFbo);
            }
            else {
                offscreen.startUsingRenderTexture();
            }
            const oldOffscreen = offscreen.getParentPartOffscreen();
            offscreen.setOldOffscreen(oldOffscreen);
            let oldFBO = null;
            if (oldOffscreen != null) {
                oldFBO = oldOffscreen.getRenderTexture();
            }
            if (oldFBO == null) {
                oldFBO = this._modelRootFbo;
            }
            offscreen.beginDraw(oldFBO);
            this.gl.viewport(0, 0, this._modelRenderTargetWidth, this._modelRenderTargetHeight);
            offscreen.clear(0.0, 0.0, 0.0, 0.0);
            this._currentOffscreen = offscreen;
            this._currentFbo = offscreen.getRenderTexture();
        }
        drawOffscreen(offscreen) {
            const offscreenIndex = offscreen.getOffscreenIndex();
            const clipContext = this._offscreenClippingManager != null
                ? this._offscreenClippingManager.getClippingContextListForOffscreen()[offscreenIndex]
                : null;
            if (clipContext != null && this.isUsingHighPrecisionMask()) {
                if (clipContext._isUsing) {
                    this.gl.viewport(0, 0, this._offscreenClippingManager.getClippingMaskBufferSize(), this._offscreenClippingManager.getClippingMaskBufferSize());
                    this.preDraw();
                    this.getOffscreenMaskBuffer(clipContext._bufferIndex).beginDraw(this._currentFbo);
                    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
                    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                }
                {
                    const clipDrawCount = clipContext._clippingIdCount;
                    for (let index = 0; index < clipDrawCount; index++) {
                        const clipDrawIndex = clipContext._clippingIdList[index];
                        if (!this.getModel().getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
                            continue;
                        }
                        this.setIsCulling(this.getModel().getDrawableCulling(clipDrawIndex) != false);
                        this.setClippingContextBufferForMask(clipContext);
                        this.drawMeshWebGL(this.getModel(), clipDrawIndex);
                    }
                }
                {
                    this.getOffscreenMaskBuffer(clipContext._bufferIndex).endDraw();
                    this.setClippingContextBufferForMask(null);
                    this.gl.viewport(0, 0, this._modelRenderTargetWidth, this._modelRenderTargetHeight);
                    this.preDraw();
                }
            }
            this.setClippingContextBufferForOffscreen(clipContext);
            this.setIsCulling(this._model.getOffscreenCulling(offscreenIndex) != false);
            this.drawOffscreenWebGL(this.getModel(), offscreen);
        }
        drawOffscreenWebGL(model, offscreen) {
            if (this.isCulling()) {
                this.gl.enable(this.gl.CULL_FACE);
            }
            else {
                this.gl.disable(this.gl.CULL_FACE);
            }
            this.gl.frontFace(this.gl.CCW);
            cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance()
                .getShader(this.gl)
                .setupShaderProgramForOffscreen(this, model, offscreen);
            offscreen.endDraw();
            this._currentOffscreen = this._currentOffscreen.getOldOffscreen();
            this._currentFbo = offscreen.getOldFBO();
            if (this._currentFbo == null) {
                this._currentOffscreen = this._modelRenderTargets[0];
                this._currentFbo = this._modelRenderTargets[0].getRenderTexture();
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this._currentFbo);
            }
            {
                const indexBuffer = this.gl.createBuffer();
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, s_renderTargetIndexArray, this.gl.STATIC_DRAW);
                this.gl.drawElements(this.gl.TRIANGLES, s_renderTargetIndexArray.length, this.gl.UNSIGNED_SHORT, 0);
                this.gl.deleteBuffer(indexBuffer);
            }
            offscreen.stopUsingRenderTexture();
            this.gl.useProgram(null);
            this.setClippingContextBufferForMask(null);
            this.setClippingContextBufferForOffscreen(null);
        }
        saveProfile() {
            this._rendererProfile.save();
        }
        restoreProfile() {
            this._rendererProfile.restore();
        }
        beforeDrawModelRenderTarget() {
            if (this._modelRenderTargets.length == 0) {
                return;
            }
            for (let i = 0; i < this._modelRenderTargets.length; ++i) {
                if (this._modelRenderTargets[i].getBufferWidth() !=
                    this._modelRenderTargetWidth ||
                    this._modelRenderTargets[i].getBufferHeight() !=
                        this._modelRenderTargetHeight) {
                    this._modelRenderTargets[i].createRenderTarget(this.gl, this._modelRenderTargetWidth, this._modelRenderTargetHeight, this._currentFbo);
                }
            }
            this._modelRenderTargets[0].beginDraw();
            this._modelRenderTargets[0].clear(0.0, 0.0, 0.0, 0.0);
        }
        afterDrawModelRenderTarget() {
            if (this._modelRenderTargets.length == 0) {
                return;
            }
            this._modelRenderTargets[0].endDraw();
            cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance()
                .getShader(this.gl)
                .setupShaderProgramForOffscreenRenderTarget(this);
            if (cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
                const indexBuffer = this.gl.createBuffer();
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, s_renderTargetIndexArray, this.gl.STATIC_DRAW);
                this.gl.drawElements(this.gl.TRIANGLES, s_renderTargetIndexArray.length, this.gl.UNSIGNED_SHORT, 0);
                this.gl.deleteBuffer(indexBuffer);
            }
            this.gl.useProgram(null);
        }
        getOffscreenMaskBuffer(index) {
            return this._offscreenMasks[index];
        }
        static doStaticRelease() {
            cubismshader_webgl_1.CubismShaderManager_WebGL.deleteInstance();
        }
        setRenderState(fbo, viewport) {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
            this.gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
            if (this._modelRenderTargetWidth != viewport[2] ||
                this._modelRenderTargetHeight != viewport[3]) {
                this._modelRenderTargetWidth = viewport[2];
                this._modelRenderTargetHeight = viewport[3];
            }
        }
        preDraw() {
            this.gl.disable(this.gl.SCISSOR_TEST);
            this.gl.disable(this.gl.STENCIL_TEST);
            this.gl.disable(this.gl.DEPTH_TEST);
            this.gl.frontFace(this.gl.CW);
            this.gl.enable(this.gl.BLEND);
            this.gl.colorMask(true, true, true, true);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
            if (this.getAnisotropy() > 0.0 && this._extension) {
                for (let i = 0; i < this._textures.size; ++i) {
                    this.gl.bindTexture(this.gl.TEXTURE_2D, this._textures.get(i));
                    this.gl.texParameterf(this.gl.TEXTURE_2D, this._extension.TEXTURE_MAX_ANISOTROPY_EXT, this.getAnisotropy());
                }
            }
        }
        getDrawableMaskBuffer(index) {
            return this._drawableMasks[index];
        }
        setClippingContextBufferForMask(clip) {
            this._clippingContextBufferForMask = clip;
        }
        getClippingContextBufferForMask() {
            return this._clippingContextBufferForMask;
        }
        setClippingContextBufferForDrawable(clip) {
            this._clippingContextBufferForDraw = clip;
        }
        getClippingContextBufferForDrawable() {
            return this._clippingContextBufferForDraw;
        }
        setClippingContextBufferForOffscreen(clip) {
            this._clippingContextBufferForOffscreen = clip;
        }
        getClippingContextBufferForOffscreen() {
            return this._clippingContextBufferForOffscreen;
        }
        isGeneratingMask() {
            return this.getClippingContextBufferForMask() != null;
        }
        startUp(gl) {
            this.gl = gl;
            if (this._drawableClippingManager) {
                this._drawableClippingManager.setGL(gl);
            }
            if (this._offscreenClippingManager) {
                this._offscreenClippingManager.setGL(gl);
            }
            cubismshader_webgl_1.CubismShaderManager_WebGL.getInstance().setGlContext(gl);
            this._rendererProfile.setGl(gl);
            this._extension =
                this.gl.getExtension('EXT_texture_filter_anisotropic') ||
                    this.gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
                    this.gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
            if (this._model.isUsingMasking()) {
                this._drawableMasks.length =
                    this._drawableClippingManager.getRenderTextureCount();
                for (let i = 0; i < this._drawableMasks.length; ++i) {
                    const renderTarget = new cubismrendertarget_webgl_3.CubismRenderTarget_WebGL();
                    renderTarget.createRenderTarget(this.gl, this._drawableClippingManager.getClippingMaskBufferSize(), this._drawableClippingManager.getClippingMaskBufferSize(), this._currentFbo);
                    this._drawableMasks[i] = renderTarget;
                }
            }
            if (this._model.isBlendModeEnabled()) {
                this._modelRenderTargets.length = 0;
                const createSize = 3;
                this._modelRenderTargets.length = createSize;
                for (let i = 0; i < createSize; ++i) {
                    const offscreenRenderTarget = new cubismoffscreenrendertarget_webgl_1.CubismOffscreenRenderTarget_WebGL();
                    offscreenRenderTarget.createRenderTarget(this.gl, this._modelRenderTargetWidth, this._modelRenderTargetHeight, this._currentFbo);
                    this._modelRenderTargets[i] = offscreenRenderTarget;
                }
                if (this._model.isUsingMaskingForOffscreen()) {
                    this._offscreenMasks.length =
                        this._offscreenClippingManager.getRenderTextureCount();
                    for (let i = 0; i < this._offscreenMasks.length; ++i) {
                        const offscreenMask = new cubismrendertarget_webgl_3.CubismRenderTarget_WebGL();
                        offscreenMask.createRenderTarget(this.gl, this._offscreenClippingManager.getClippingMaskBufferSize(), this._offscreenClippingManager.getClippingMaskBufferSize(), this._currentFbo);
                        this._offscreenMasks[i] = offscreenMask;
                    }
                }
                const offscreenCount = this._model.getOffscreenCount();
                if (offscreenCount > 0) {
                    this._offscreenList = new Array(offscreenCount);
                    for (let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex) {
                        const offscreenRenderTarget = new cubismoffscreenrendertarget_webgl_1.CubismOffscreenRenderTarget_WebGL();
                        offscreenRenderTarget.setOffscreenIndex(offscreenIndex);
                        this._offscreenList[offscreenIndex] = offscreenRenderTarget;
                    }
                    this.setupParentOffscreens(this._model, offscreenCount);
                }
            }
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this._currentFbo);
        }
    }
    exports.CubismRenderer_WebGL = CubismRenderer_WebGL;
    cubismrenderer_5.CubismRenderer.staticRelease = () => {
        CubismRenderer_WebGL.doStaticRelease();
    };
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismClippingContext = $.CubismClippingContext_WebGL;
        Live2DCubismFramework.CubismClippingManager_WebGL = $.CubismClippingManager_WebGL;
        Live2DCubismFramework.CubismRenderer_WebGL = $.CubismRenderer_WebGL;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/rendering/cubismshader_webgl", ["require", "exports", "framework/src/math/cubismmatrix44", "framework/src/model/cubismmodel", "framework/src/utils/cubismdebug", "framework/src/rendering/cubismrendertarget_webgl", "framework/src/rendering/cubismrenderer", "framework/src/rendering/cubismshader_webgl"], function (require, exports, cubismmatrix44_3, cubismmodel_3, cubismdebug_11, cubismrendertarget_webgl_4, cubismrenderer_6, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.ShaderType = exports.ShaderNames = exports.CubismShaderSet = exports.CubismShaderManager_WebGL = exports.CubismShader_WebGL = void 0;
    const VertShaderSrcPath = 'vertshadersrc.vert';
    const VertShaderSrcMaskedPath = 'vertshadersrcmasked.vert';
    const VertShaderSrcSetupMaskPath = 'vertshadersrcsetupmask.vert';
    const FragShaderSrcSetupMaskPath = 'fragshadersrcsetupmask.frag';
    const FragShaderSrcPremultipliedAlphaPath = 'fragshadersrcpremultipliedalpha.frag';
    const FragShaderSrcMaskPremultipliedAlphaPath = 'fragshadersrcmaskpremultipliedalpha.frag';
    const FragShaderSrcMaskInvertedPremultipliedAlphaPath = 'fragshadersrcmaskinvertedpremultipliedalpha.frag';
    const VertShaderSrcCopyPath = 'vertshadersrccopy.vert';
    const FragShaderSrcCopyPath = 'fragshadersrccopy.frag';
    const FragShaderSrcColorBlendPath = 'fragshadersrccolorblend.frag';
    const FragShaderSrcAlphaBlendPath = 'fragshadersrcalphablend.frag';
    const VertShaderSrcBlendPath = 'vertshadersrcblend.vert';
    const FragShaderSrcBlendPath = 'fragshadersrcpremultipliedalphablend.frag';
    const ColorBlendPrefix = 'ColorBlend_';
    const AlphaBlendPrefix = 'AlphaBlend_';
    let s_instance;
    const s_renderTargetVertexArray = new Float32Array([
        -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0
    ]);
    const s_renderTargetUvArray = new Float32Array([
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0
    ]);
    const s_renderTargetReverseUvArray = new Float32Array([
        0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0
    ]);
    class CubismShader_WebGL {
        async loadShader(url) {
            const response = await fetch(url);
            return await response.text();
        }
        async loadShaders() {
            var _a;
            const shaderDir = (_a = this._shaderPath) !== null && _a !== void 0 ? _a : this._defaultShaderPath;
            const shaderFiles = [
                { path: shaderDir + VertShaderSrcPath, prop: '_vertShaderSrc' },
                {
                    path: shaderDir + VertShaderSrcMaskedPath,
                    prop: '_vertShaderSrcMasked'
                },
                {
                    path: shaderDir + VertShaderSrcSetupMaskPath,
                    prop: '_vertShaderSrcSetupMask'
                },
                {
                    path: shaderDir + FragShaderSrcSetupMaskPath,
                    prop: '_fragShaderSrcSetupMask'
                },
                {
                    path: shaderDir + FragShaderSrcPremultipliedAlphaPath,
                    prop: '_fragShaderSrcPremultipliedAlpha'
                },
                {
                    path: shaderDir + FragShaderSrcMaskPremultipliedAlphaPath,
                    prop: '_fragShaderSrcMaskPremultipliedAlpha'
                },
                {
                    path: shaderDir + FragShaderSrcMaskInvertedPremultipliedAlphaPath,
                    prop: '_fragShaderSrcMaskInvertedPremultipliedAlpha'
                },
                { path: shaderDir + VertShaderSrcCopyPath, prop: '_vertShaderSrcCopy' },
                { path: shaderDir + FragShaderSrcCopyPath, prop: '_fragShaderSrcCopy' },
                {
                    path: shaderDir + FragShaderSrcColorBlendPath,
                    prop: '_fragShaderSrcColorBlend'
                },
                {
                    path: shaderDir + FragShaderSrcAlphaBlendPath,
                    prop: '_fragShaderSrcAlphaBlend'
                },
                { path: shaderDir + VertShaderSrcBlendPath, prop: '_vertShaderSrcBlend' },
                { path: shaderDir + FragShaderSrcBlendPath, prop: '_fragShaderSrcBlend' }
            ];
            const results = await Promise.all(shaderFiles.map(file => this.loadShader(file.path)
                .then(data => ({ prop: file.prop, data }))
                .catch(error => {
                console.error(`Error loading ${file.path} shader:`, error);
                return { prop: file.prop, data: '' };
            })));
            results.forEach(result => {
                this[result.prop] = result.data;
            });
        }
        constructor() {
            this._shaderSets = new Array();
            this._isShaderLoading = false;
            this._isShaderLoaded = false;
            this._colorBlendMap = new Map();
            this._colorBlendValues = new Array();
            const colorBlendKeys = Object.keys(cubismmodel_3.CubismColorBlend);
            const colorBlendRawValues = Object.keys(cubismmodel_3.CubismColorBlend).map(k => cubismmodel_3.CubismColorBlend[k]);
            for (let i = 0; i < colorBlendKeys.length; i++) {
                const colorBlendKey = colorBlendKeys[i];
                if (colorBlendKey.includes(ColorBlendPrefix)) {
                    const blendModeName = colorBlendKey.slice(ColorBlendPrefix.length);
                    const colorBlendNumber = parseInt(colorBlendRawValues[i].toString());
                    this._colorBlendMap.set(colorBlendNumber, blendModeName);
                    this._colorBlendValues.push(colorBlendNumber);
                }
            }
            this._alphaBlendMap = new Map();
            this._alphaBlendValues = new Array();
            const alphaBlendKeys = Object.keys(cubismmodel_3.CubismAlphaBlend);
            const alphaBlendRawValues = Object.keys(cubismmodel_3.CubismAlphaBlend).map(k => cubismmodel_3.CubismAlphaBlend[k]);
            for (let i = 0; i < alphaBlendKeys.length; i++) {
                const alphaBlendKey = alphaBlendKeys[i];
                if (alphaBlendKey.includes(AlphaBlendPrefix)) {
                    const blendModeName = alphaBlendKey.slice(AlphaBlendPrefix.length);
                    const alphaBlendNumber = parseInt(alphaBlendRawValues[i].toString());
                    this._alphaBlendMap.set(alphaBlendNumber, blendModeName);
                    this._alphaBlendValues.push(alphaBlendNumber);
                }
            }
            this._blendShaderSetMap = new Map();
            this._shaderCount =
                ShaderNames.ShaderNames_ShaderCount +
                    1 +
                    (this._colorBlendValues.length - 3) *
                        (this._alphaBlendValues.length - 1) *
                        3;
            this._defaultShaderPath = '../../Framework/Shaders/WebGL/';
            this._shaderPath = this._defaultShaderPath;
        }
        release() {
            this.releaseShaderProgram();
        }
        setupShaderProgramForDrawable(renderer, model, index) {
            if (!renderer.isPremultipliedAlpha()) {
                (0, cubismdebug_11.CubismLogError)('NoPremultipliedAlpha is not allowed');
            }
            if (this._shaderSets.length == 0) {
                this.generateShaders();
            }
            if (this._isShaderLoaded == false) {
                (0, cubismdebug_11.CubismLogWarning)('Shader program is not initialized.');
                return;
            }
            let srcColor;
            let dstColor;
            let srcAlpha;
            let dstAlpha;
            const masked = renderer.getClippingContextBufferForDrawable() != null;
            const invertedMask = model.getDrawableInvertedMaskBit(index);
            const offset = masked ? (invertedMask ? 2 : 1) : 0;
            let shaderSet;
            let isUsingCompatible = true;
            if (model.isBlendModeEnabled()) {
                const colorBlendMode = model.getDrawableColorBlend(index);
                const alphaBlendMode = model.getDrawableAlphaBlend(index);
                if (colorBlendMode == cubismmodel_3.CubismColorBlend.ColorBlend_None ||
                    alphaBlendMode == cubismmodel_3.CubismAlphaBlend.AlphaBlend_None ||
                    (colorBlendMode == cubismmodel_3.CubismColorBlend.ColorBlend_Normal &&
                        alphaBlendMode == cubismmodel_3.CubismAlphaBlend.AlphaBlend_Over)) {
                    shaderSet =
                        this._shaderSets[ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset];
                    srcColor = this.gl.ONE;
                    dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                    srcAlpha = this.gl.ONE;
                    dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
                }
                else {
                    switch (colorBlendMode) {
                        case cubismmodel_3.CubismColorBlend.ColorBlend_AddCompatible:
                            shaderSet =
                                this._shaderSets[ShaderNames.ShaderNames_AddPremultipliedAlpha + offset];
                            srcColor = this.gl.ONE;
                            dstColor = this.gl.ONE;
                            srcAlpha = this.gl.ZERO;
                            dstAlpha = this.gl.ONE;
                            break;
                        case cubismmodel_3.CubismColorBlend.ColorBlend_MultiplyCompatible:
                            shaderSet =
                                this._shaderSets[ShaderNames.ShaderNames_MultPremultipliedAlpha + offset];
                            srcColor = this.gl.DST_COLOR;
                            dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                            srcAlpha = this.gl.ZERO;
                            dstAlpha = this.gl.ONE;
                            break;
                        default:
                            {
                                const srcBuffer = renderer._currentOffscreen != null
                                    ? renderer._currentOffscreen
                                    : renderer.getModelRenderTarget(0);
                                cubismrendertarget_webgl_4.CubismRenderTarget_WebGL.copyBuffer(this.gl, srcBuffer, renderer.getModelRenderTarget(1));
                                const baseShaderSetIndex = this._blendShaderSetMap.get(this._colorBlendMap.get(colorBlendMode) +
                                    this._alphaBlendMap.get(alphaBlendMode));
                                shaderSet = this._shaderSets[baseShaderSetIndex + offset];
                                srcColor = this.gl.ONE;
                                dstColor = this.gl.ZERO;
                                srcAlpha = this.gl.ONE;
                                dstAlpha = this.gl.ZERO;
                                isUsingCompatible = false;
                            }
                            break;
                    }
                }
            }
            else {
                switch (model.getDrawableBlendMode(index)) {
                    case cubismrenderer_6.CubismBlendMode.CubismBlendMode_Normal:
                    default:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset];
                        srcColor = this.gl.ONE;
                        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                        srcAlpha = this.gl.ONE;
                        dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
                        break;
                    case cubismrenderer_6.CubismBlendMode.CubismBlendMode_Additive:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_AddPremultipliedAlpha + offset];
                        srcColor = this.gl.ONE;
                        dstColor = this.gl.ONE;
                        srcAlpha = this.gl.ZERO;
                        dstAlpha = this.gl.ONE;
                        break;
                    case cubismrenderer_6.CubismBlendMode.CubismBlendMode_Multiplicative:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_MultPremultipliedAlpha + offset];
                        srcColor = this.gl.DST_COLOR;
                        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                        srcAlpha = this.gl.ZERO;
                        dstAlpha = this.gl.ONE;
                        break;
                }
            }
            this.gl.useProgram(shaderSet.shaderProgram);
            if (renderer._bufferData.vertex == null) {
                renderer._bufferData.vertex = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
            const vertexArray = model.getDrawableVertices(index);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
            this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, 0, 0);
            if (renderer._bufferData.uv == null) {
                renderer._bufferData.uv = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
            const uvArray = model.getDrawableVertexUvs(index);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
            this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
            if (masked) {
                this.gl.activeTexture(this.gl.TEXTURE1);
                const tex = renderer
                    .getDrawableMaskBuffer(renderer.getClippingContextBufferForDrawable()._bufferIndex)
                    .getColorBuffer();
                this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
                this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
                this.gl.uniformMatrix4fv(shaderSet.uniformClipMatrixLocation, false, renderer.getClippingContextBufferForDrawable()._matrixForDraw.getArray());
                const channelIndex = renderer.getClippingContextBufferForDrawable()._layoutChannelIndex;
                const colorChannel = renderer
                    .getClippingContextBufferForDrawable()
                    .getClippingManager()
                    .getChannelFlagAsColor(channelIndex);
                this.gl.uniform4f(shaderSet.uniformChannelFlagLocation, colorChannel.r, colorChannel.g, colorChannel.b, colorChannel.a);
                if (model.isBlendModeEnabled()) {
                    this.gl.uniform1f(shaderSet.uniformInvertMaskFlagLocation, invertedMask ? 1.0 : 0.0);
                }
            }
            const textureNo = model.getDrawableTextureIndex(index);
            const textureId = renderer.getBindedTextures().get(textureNo);
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
            this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
            const matrix4x4 = renderer.getMvpMatrix();
            this.gl.uniformMatrix4fv(shaderSet.uniformMatrixLocation, false, matrix4x4.getArray());
            let baseColor = null;
            if (model.isBlendModeEnabled()) {
                const drawableOpacity = model.getDrawableOpacity(index);
                baseColor = new cubismrenderer_6.CubismTextureColor(drawableOpacity, drawableOpacity, drawableOpacity, drawableOpacity);
            }
            else {
                baseColor = renderer.getModelColorWithOpacity(model.getDrawableOpacity(index));
            }
            const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
            const multiplyColor = multiplyAndScreenColor.getDrawableMultiplyColor(index);
            const screenColor = multiplyAndScreenColor.getDrawableScreenColor(index);
            this.gl.uniform4f(shaderSet.uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
            this.gl.uniform4f(shaderSet.uniformMultiplyColorLocation, multiplyColor.r, multiplyColor.g, multiplyColor.b, multiplyColor.a);
            this.gl.uniform4f(shaderSet.uniformScreenColorLocation, screenColor.r, screenColor.g, screenColor.b, screenColor.a);
            if (model.isBlendModeEnabled()) {
                this.gl.activeTexture(this.gl.TEXTURE2);
                if (!isUsingCompatible) {
                    const tex = renderer
                        .getModelRenderTarget(1)
                        .getColorBuffer();
                    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
                    this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
                }
            }
            if (renderer._bufferData.index == null) {
                renderer._bufferData.index = this.gl.createBuffer();
            }
            const indexArray = model.getDrawableVertexIndices(index);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, renderer._bufferData.index);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indexArray, this.gl.DYNAMIC_DRAW);
            this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
        }
        setupShaderProgramForOffscreen(renderer, model, offscreen) {
            if (!renderer.isPremultipliedAlpha()) {
                (0, cubismdebug_11.CubismLogError)('NoPremultipliedAlpha is not allowed');
            }
            if (this._shaderSets.length == 0) {
                this.generateShaders();
            }
            if (this._isShaderLoaded == false) {
                (0, cubismdebug_11.CubismLogWarning)('Shader program is not initialized.');
                return;
            }
            let srcColor;
            let dstColor;
            let srcAlpha;
            let dstAlpha;
            const offscreenIndex = offscreen.getOffscreenIndex();
            const masked = renderer.getClippingContextBufferForOffscreen() != null;
            const invertedMask = model.getOffscreenInvertedMask(offscreenIndex);
            const offset = masked ? (invertedMask ? 2 : 1) : 0;
            let shaderSet;
            let isUsingCompatible = true;
            const colorBlendMode = model.getOffscreenColorBlend(offscreenIndex);
            const alphaBlendMode = model.getOffscreenAlphaBlend(offscreenIndex);
            if (colorBlendMode == cubismmodel_3.CubismColorBlend.ColorBlend_None ||
                alphaBlendMode == cubismmodel_3.CubismAlphaBlend.AlphaBlend_None ||
                (colorBlendMode == cubismmodel_3.CubismColorBlend.ColorBlend_Normal &&
                    alphaBlendMode == cubismmodel_3.CubismAlphaBlend.AlphaBlend_Over)) {
                shaderSet =
                    this._shaderSets[ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset];
                srcColor = this.gl.ONE;
                dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                srcAlpha = this.gl.ONE;
                dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
            }
            else {
                switch (colorBlendMode) {
                    case cubismmodel_3.CubismColorBlend.ColorBlend_AddCompatible:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_AddPremultipliedAlpha + offset];
                        srcColor = this.gl.ONE;
                        dstColor = this.gl.ONE;
                        srcAlpha = this.gl.ZERO;
                        dstAlpha = this.gl.ONE;
                        break;
                    case cubismmodel_3.CubismColorBlend.ColorBlend_MultiplyCompatible:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_MultPremultipliedAlpha + offset];
                        srcColor = this.gl.DST_COLOR;
                        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                        srcAlpha = this.gl.ZERO;
                        dstAlpha = this.gl.ONE;
                        break;
                    default:
                        {
                            const srcBuffer = offscreen.getOldOffscreen() != null
                                ? offscreen.getOldOffscreen()
                                : renderer.getModelRenderTarget(0);
                            cubismrendertarget_webgl_4.CubismRenderTarget_WebGL.copyBuffer(this.gl, srcBuffer, renderer.getModelRenderTarget(1));
                            const baseShaderSetIndex = this._blendShaderSetMap.get(this._colorBlendMap.get(colorBlendMode) +
                                this._alphaBlendMap.get(alphaBlendMode));
                            shaderSet = this._shaderSets[baseShaderSetIndex + offset];
                            srcColor = this.gl.ONE;
                            dstColor = this.gl.ZERO;
                            srcAlpha = this.gl.ONE;
                            dstAlpha = this.gl.ZERO;
                            isUsingCompatible = false;
                        }
                        break;
                }
            }
            this.gl.useProgram(shaderSet.shaderProgram);
            cubismrendertarget_webgl_4.CubismRenderTarget_WebGL.copyBuffer(this.gl, offscreen, renderer.getModelRenderTarget(2));
            this.gl.activeTexture(this.gl.TEXTURE0);
            const tex0 = renderer.getModelRenderTarget(2).getColorBuffer();
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex0);
            this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
            const matrix4x4 = new cubismmatrix44_3.CubismMatrix44();
            matrix4x4.loadIdentity();
            this.gl.uniformMatrix4fv(shaderSet.uniformMatrixLocation, false, matrix4x4.getArray());
            const offscreenOpacity = model.getOffscreenOpacity(offscreenIndex);
            const baseColor = new cubismrenderer_6.CubismTextureColor(offscreenOpacity, offscreenOpacity, offscreenOpacity, offscreenOpacity);
            const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
            const multiplyColor = multiplyAndScreenColor.getOffscreenMultiplyColor(offscreenIndex);
            const screenColor = multiplyAndScreenColor.getOffscreenScreenColor(offscreenIndex);
            this.gl.uniform4f(shaderSet.uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
            this.gl.uniform4f(shaderSet.uniformMultiplyColorLocation, multiplyColor.r, multiplyColor.g, multiplyColor.b, multiplyColor.a);
            this.gl.uniform4f(shaderSet.uniformScreenColorLocation, screenColor.r, screenColor.g, screenColor.b, screenColor.a);
            this.gl.activeTexture(this.gl.TEXTURE2);
            if (!isUsingCompatible) {
                const tex1 = renderer
                    .getModelRenderTarget(1)
                    .getColorBuffer();
                this.gl.bindTexture(this.gl.TEXTURE_2D, tex1);
                this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
            }
            if (masked) {
                this.gl.activeTexture(this.gl.TEXTURE1);
                const tex2 = renderer
                    .getOffscreenMaskBuffer(renderer.getClippingContextBufferForOffscreen()._bufferIndex)
                    .getColorBuffer();
                this.gl.bindTexture(this.gl.TEXTURE_2D, tex2);
                this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
                this.gl.uniformMatrix4fv(shaderSet.uniformClipMatrixLocation, false, renderer
                    .getClippingContextBufferForOffscreen()
                    ._matrixForDraw.getArray());
                const channelIndex = renderer.getClippingContextBufferForOffscreen()._layoutChannelIndex;
                const colorChannel = renderer
                    .getClippingContextBufferForOffscreen()
                    .getClippingManager()
                    .getChannelFlagAsColor(channelIndex);
                this.gl.uniform4f(shaderSet.uniformChannelFlagLocation, colorChannel.r, colorChannel.g, colorChannel.b, colorChannel.a);
                if (model.isBlendModeEnabled()) {
                    this.gl.uniform1f(shaderSet.uniformInvertMaskFlagLocation, invertedMask ? 1.0 : 0.0);
                }
            }
            if (!renderer._bufferData.vertex) {
                renderer._bufferData.vertex = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetVertexArray, this.gl.STATIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
            this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
            if (!renderer._bufferData.uv) {
                renderer._bufferData.uv = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetReverseUvArray, this.gl.STATIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
            this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
            this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
        }
        setupShaderProgramForMask(renderer, model, index) {
            if (!renderer.isPremultipliedAlpha()) {
                (0, cubismdebug_11.CubismLogError)('NoPremultipliedAlpha is not allowed');
            }
            if (this._shaderSets.length == 0) {
                this.generateShaders();
            }
            if (this._isShaderLoaded == false) {
                (0, cubismdebug_11.CubismLogWarning)('Shader program is not initialized.');
                return;
            }
            const shaderSet = this._shaderSets[ShaderNames.ShaderNames_SetupMask];
            this.gl.useProgram(shaderSet.shaderProgram);
            if (renderer._bufferData.vertex == null) {
                renderer._bufferData.vertex = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
            const vertexArray = model.getDrawableVertices(index);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
            this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, 0, 0);
            if (renderer._bufferData.uv == null) {
                renderer._bufferData.uv = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
            const textureNo = model.getDrawableTextureIndex(index);
            const textureId = renderer.getBindedTextures().get(textureNo);
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
            this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
            if (renderer._bufferData.uv == null) {
                renderer._bufferData.uv = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
            const uvArray = model.getDrawableVertexUvs(index);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
            this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
            const channelIndex = renderer.getClippingContextBufferForMask()._layoutChannelIndex;
            const colorChannel = renderer
                .getClippingContextBufferForMask()
                .getClippingManager()
                .getChannelFlagAsColor(channelIndex);
            this.gl.uniform4f(shaderSet.uniformChannelFlagLocation, colorChannel.r, colorChannel.g, colorChannel.b, colorChannel.a);
            this.gl.uniformMatrix4fv(shaderSet.uniformClipMatrixLocation, false, renderer.getClippingContextBufferForMask()._matrixForMask.getArray());
            const rect = renderer.getClippingContextBufferForMask()._layoutBounds;
            this.gl.uniform4f(shaderSet.uniformBaseColorLocation, rect.x * 2.0 - 1.0, rect.y * 2.0 - 1.0, rect.getRight() * 2.0 - 1.0, rect.getBottom() * 2.0 - 1.0);
            const srcColor = this.gl.ZERO;
            const dstColor = this.gl.ONE_MINUS_SRC_COLOR;
            const srcAlpha = this.gl.ZERO;
            const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
            if (renderer._bufferData.index == null) {
                renderer._bufferData.index = this.gl.createBuffer();
            }
            const indexArray = model.getDrawableVertexIndices(index);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, renderer._bufferData.index);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indexArray, this.gl.DYNAMIC_DRAW);
            this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
        }
        setupShaderProgramForOffscreenRenderTarget(renderer) {
            if (this._shaderSets.length == 0) {
                this.generateShaders();
            }
            if (this._isShaderLoaded == false) {
                (0, cubismdebug_11.CubismLogWarning)('Shader program is not initialized.');
                return;
            }
            const baseColor = renderer.getModelColor();
            baseColor.r *= baseColor.a;
            baseColor.g *= baseColor.a;
            baseColor.b *= baseColor.a;
            this.copyTexture(renderer, baseColor);
        }
        copyTexture(renderer, baseColor) {
            const srcColor = this.gl.ONE;
            const dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
            const srcAlpha = this.gl.ONE;
            const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
            const shaderSet = this._shaderSets[10];
            this.gl.useProgram(shaderSet.shaderProgram);
            this.gl.uniform4f(shaderSet.uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
            this.gl.activeTexture(this.gl.TEXTURE0);
            const tex = renderer.getModelRenderTarget(0).getColorBuffer();
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
            this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
            if (!renderer._bufferData.vertex) {
                renderer._bufferData.vertex = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetVertexArray, this.gl.STATIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
            this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
            if (!renderer._bufferData.uv) {
                renderer._bufferData.uv = this.gl.createBuffer();
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetUvArray, this.gl.STATIC_DRAW);
            this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
            this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
            this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
        }
        releaseShaderProgram() {
            for (let i = 0; i < this._shaderSets.length; i++) {
                this.gl.deleteProgram(this._shaderSets[i].shaderProgram);
                this._shaderSets[i].shaderProgram = 0;
                this._shaderSets[i] = void 0;
                this._shaderSets[i] = null;
            }
        }
        generateShaders() {
            if (this._isShaderLoading) {
                return;
            }
            this._isShaderLoading = true;
            this._isShaderLoaded = false;
            this._shaderSets.length = this._shaderCount;
            for (let i = 0; i < this._shaderCount; i++) {
                this._shaderSets[i] = new CubismShaderSet();
            }
            this.loadShaders()
                .then(() => {
                this.registerShader();
                this.registerBlendShader();
                this._isShaderLoading = false;
                this._isShaderLoaded = true;
            })
                .catch(error => {
                this._isShaderLoading = false;
                console.error('Failed to load shaders:', error);
            });
        }
        registerShader() {
            const vertexShaderSrc = this._vertShaderSrc;
            const vertexShaderSrcMasked = this._vertShaderSrcMasked;
            const vertexShaderSrcSetupMask = this._vertShaderSrcSetupMask;
            const fragmentShaderSrcSetupMask = this._fragShaderSrcSetupMask;
            const fragmentShaderSrcPremultipliedAlpha = this._fragShaderSrcPremultipliedAlpha;
            const fragmentShaderSrcMaskPremultipliedAlpha = this._fragShaderSrcMaskPremultipliedAlpha;
            const fragmentShaderSrcMaskInvertedPremultipliedAlpha = this._fragShaderSrcMaskInvertedPremultipliedAlpha;
            this._shaderSets[0].shaderProgram = this.loadShaderProgram(vertexShaderSrcSetupMask, fragmentShaderSrcSetupMask);
            this._shaderSets[1].shaderProgram = this.loadShaderProgram(vertexShaderSrc, fragmentShaderSrcPremultipliedAlpha);
            this._shaderSets[2].shaderProgram = this.loadShaderProgram(vertexShaderSrcMasked, fragmentShaderSrcMaskPremultipliedAlpha);
            this._shaderSets[3].shaderProgram = this.loadShaderProgram(vertexShaderSrcMasked, fragmentShaderSrcMaskInvertedPremultipliedAlpha);
            this._shaderSets[4].shaderProgram = this._shaderSets[1].shaderProgram;
            this._shaderSets[5].shaderProgram = this._shaderSets[2].shaderProgram;
            this._shaderSets[6].shaderProgram = this._shaderSets[3].shaderProgram;
            this._shaderSets[7].shaderProgram = this._shaderSets[1].shaderProgram;
            this._shaderSets[8].shaderProgram = this._shaderSets[2].shaderProgram;
            this._shaderSets[9].shaderProgram = this._shaderSets[3].shaderProgram;
            this._shaderSets[0].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[0].shaderProgram, 'a_position');
            this._shaderSets[0].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[0].shaderProgram, 'a_texCoord');
            this._shaderSets[0].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 's_texture0');
            this._shaderSets[0].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 'u_clipMatrix');
            this._shaderSets[0].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 'u_channelFlag');
            this._shaderSets[0].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 'u_baseColor');
            this._shaderSets[1].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[1].shaderProgram, 'a_position');
            this._shaderSets[1].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[1].shaderProgram, 'a_texCoord');
            this._shaderSets[1].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 's_texture0');
            this._shaderSets[1].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_matrix');
            this._shaderSets[1].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_baseColor');
            this._shaderSets[1].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_multiplyColor');
            this._shaderSets[1].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_screenColor');
            this._shaderSets[2].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[2].shaderProgram, 'a_position');
            this._shaderSets[2].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[2].shaderProgram, 'a_texCoord');
            this._shaderSets[2].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 's_texture0');
            this._shaderSets[2].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 's_texture1');
            this._shaderSets[2].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_matrix');
            this._shaderSets[2].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_clipMatrix');
            this._shaderSets[2].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_channelFlag');
            this._shaderSets[2].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_baseColor');
            this._shaderSets[2].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_multiplyColor');
            this._shaderSets[2].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_screenColor');
            this._shaderSets[3].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[3].shaderProgram, 'a_position');
            this._shaderSets[3].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[3].shaderProgram, 'a_texCoord');
            this._shaderSets[3].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 's_texture0');
            this._shaderSets[3].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 's_texture1');
            this._shaderSets[3].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_matrix');
            this._shaderSets[3].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_clipMatrix');
            this._shaderSets[3].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_channelFlag');
            this._shaderSets[3].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_baseColor');
            this._shaderSets[3].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_multiplyColor');
            this._shaderSets[3].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_screenColor');
            this._shaderSets[4].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[4].shaderProgram, 'a_position');
            this._shaderSets[4].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[4].shaderProgram, 'a_texCoord');
            this._shaderSets[4].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 's_texture0');
            this._shaderSets[4].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_matrix');
            this._shaderSets[4].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_baseColor');
            this._shaderSets[4].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_multiplyColor');
            this._shaderSets[4].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_screenColor');
            this._shaderSets[5].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[5].shaderProgram, 'a_position');
            this._shaderSets[5].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[5].shaderProgram, 'a_texCoord');
            this._shaderSets[5].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 's_texture0');
            this._shaderSets[5].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 's_texture1');
            this._shaderSets[5].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_matrix');
            this._shaderSets[5].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_clipMatrix');
            this._shaderSets[5].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_channelFlag');
            this._shaderSets[5].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_baseColor');
            this._shaderSets[5].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_multiplyColor');
            this._shaderSets[5].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_screenColor');
            this._shaderSets[6].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[6].shaderProgram, 'a_position');
            this._shaderSets[6].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[6].shaderProgram, 'a_texCoord');
            this._shaderSets[6].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 's_texture0');
            this._shaderSets[6].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 's_texture1');
            this._shaderSets[6].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_matrix');
            this._shaderSets[6].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_clipMatrix');
            this._shaderSets[6].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_channelFlag');
            this._shaderSets[6].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_baseColor');
            this._shaderSets[6].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_multiplyColor');
            this._shaderSets[6].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_screenColor');
            this._shaderSets[7].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[7].shaderProgram, 'a_position');
            this._shaderSets[7].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[7].shaderProgram, 'a_texCoord');
            this._shaderSets[7].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 's_texture0');
            this._shaderSets[7].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_matrix');
            this._shaderSets[7].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_baseColor');
            this._shaderSets[7].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_multiplyColor');
            this._shaderSets[7].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_screenColor');
            this._shaderSets[8].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[8].shaderProgram, 'a_position');
            this._shaderSets[8].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[8].shaderProgram, 'a_texCoord');
            this._shaderSets[8].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 's_texture0');
            this._shaderSets[8].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 's_texture1');
            this._shaderSets[8].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_matrix');
            this._shaderSets[8].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_clipMatrix');
            this._shaderSets[8].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_channelFlag');
            this._shaderSets[8].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_baseColor');
            this._shaderSets[8].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_multiplyColor');
            this._shaderSets[8].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_screenColor');
            this._shaderSets[9].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[9].shaderProgram, 'a_position');
            this._shaderSets[9].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[9].shaderProgram, 'a_texCoord');
            this._shaderSets[9].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 's_texture0');
            this._shaderSets[9].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 's_texture1');
            this._shaderSets[9].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_matrix');
            this._shaderSets[9].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_clipMatrix');
            this._shaderSets[9].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_channelFlag');
            this._shaderSets[9].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_baseColor');
            this._shaderSets[9].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_multiplyColor');
            this._shaderSets[9].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_screenColor');
        }
        registerBlendShader() {
            const vertShaderSrcCopy = this._vertShaderSrcCopy;
            const fragShaderSrcCopy = this._fragShaderSrcCopy;
            const copyShaderSet = this._shaderSets[10];
            copyShaderSet.shaderProgram = this.loadShaderProgram(vertShaderSrcCopy, fragShaderSrcCopy);
            copyShaderSet.attributeTexCoordLocation = this.gl.getAttribLocation(copyShaderSet.shaderProgram, 'a_texCoord');
            copyShaderSet.attributePositionLocation = this.gl.getAttribLocation(copyShaderSet.shaderProgram, 'a_position');
            copyShaderSet.uniformBaseColorLocation = this.gl.getUniformLocation(copyShaderSet.shaderProgram, 'u_baseColor');
            let shaderSetIndex = 11;
            for (let colorBlendIndex = 0; colorBlendIndex < this._colorBlendValues.length; colorBlendIndex++) {
                if (this._colorBlendValues[colorBlendIndex] ==
                    cubismmodel_3.CubismColorBlend.ColorBlend_None ||
                    this._colorBlendValues[colorBlendIndex] ==
                        cubismmodel_3.CubismColorBlend.ColorBlend_AddCompatible ||
                    this._colorBlendValues[colorBlendIndex] ==
                        cubismmodel_3.CubismColorBlend.ColorBlend_MultiplyCompatible) {
                    continue;
                }
                const colorBlendValue = this._colorBlendValues[colorBlendIndex];
                const colorBlendName = this._colorBlendMap
                    .get(colorBlendValue)
                    .toUpperCase();
                const colorBlendMacro = `#define COLOR_BLEND_${colorBlendName}\n`;
                for (let alphablendIndex = 0; alphablendIndex < this._alphaBlendValues.length; alphablendIndex++) {
                    if (this._alphaBlendValues[alphablendIndex] ==
                        cubismmodel_3.CubismAlphaBlend.AlphaBlend_None ||
                        (this._colorBlendValues[colorBlendIndex] ==
                            cubismmodel_3.CubismColorBlend.ColorBlend_Normal &&
                            this._alphaBlendValues[alphablendIndex] ==
                                cubismmodel_3.CubismAlphaBlend.AlphaBlend_Over)) {
                        continue;
                    }
                    const alphaBlendValue = this._alphaBlendValues[alphablendIndex];
                    const alphaBlendName = this._alphaBlendMap
                        .get(alphaBlendValue)
                        .toUpperCase();
                    const alphaBlendMacro = `#define ALPHA_BLEND_${alphaBlendName}\n`;
                    this.generateBlendShader(colorBlendMacro, alphaBlendMacro, shaderSetIndex);
                    this._blendShaderSetMap.set(this._colorBlendMap.get(this._colorBlendValues[colorBlendIndex]) +
                        this._alphaBlendMap.get(this._alphaBlendValues[alphablendIndex]), shaderSetIndex);
                    shaderSetIndex += ShaderType.ShaderType_Count;
                }
            }
        }
        generateBlendShader(colorBlendMacro, alphaBlendMacro, shaderSetBaseIndex) {
            for (let shaderTypeIndex = 0; shaderTypeIndex < ShaderType.ShaderType_Count; shaderTypeIndex++) {
                let vertexShaderSrc = '';
                let fragmentShaderStr = 'precision mediump float;\n';
                const shaderSetIndex = shaderSetBaseIndex + shaderTypeIndex;
                fragmentShaderStr += colorBlendMacro;
                fragmentShaderStr += alphaBlendMacro;
                fragmentShaderStr += this._fragShaderSrcColorBlend;
                fragmentShaderStr += this._fragShaderSrcAlphaBlend;
                if (shaderTypeIndex == ShaderType.ShaderType_Masked ||
                    shaderTypeIndex == ShaderType.ShaderType_MaskedInverted) {
                    const clippingMaskMacro = '#define CLIPPING_MASK\n';
                    vertexShaderSrc += clippingMaskMacro;
                    fragmentShaderStr += clippingMaskMacro;
                }
                vertexShaderSrc += this._vertShaderSrcBlend;
                fragmentShaderStr += this._fragShaderSrcBlend;
                this._shaderSets[shaderSetIndex].shaderProgram = this.loadShaderProgram(vertexShaderSrc, fragmentShaderStr);
                this._shaderSets[shaderSetIndex].attributePositionLocation =
                    this.gl.getAttribLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'a_position');
                this._shaderSets[shaderSetIndex].attributeTexCoordLocation =
                    this.gl.getAttribLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'a_texCoord');
                this._shaderSets[shaderSetIndex].samplerTexture0Location =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 's_texture0');
                this._shaderSets[shaderSetIndex].uniformMatrixLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_matrix');
                this._shaderSets[shaderSetIndex].uniformBaseColorLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_baseColor');
                this._shaderSets[shaderSetIndex].uniformMultiplyColorLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_multiplyColor');
                this._shaderSets[shaderSetIndex].uniformScreenColorLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_screenColor');
                this._shaderSets[shaderSetIndex].samplerFrameBufferTextureLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 's_blendTexture');
                if (shaderTypeIndex == ShaderType.ShaderType_Masked ||
                    shaderTypeIndex == ShaderType.ShaderType_MaskedInverted) {
                    this._shaderSets[shaderSetIndex].samplerTexture1Location =
                        this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 's_texture1');
                    this._shaderSets[shaderSetIndex].uniformClipMatrixLocation =
                        this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_clipMatrix');
                    this._shaderSets[shaderSetIndex].uniformChannelFlagLocation =
                        this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_channelFlag');
                    this._shaderSets[shaderSetIndex].uniformInvertMaskFlagLocation =
                        this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_invertClippingMask');
                }
            }
        }
        loadShaderProgram(vertexShaderSource, fragmentShaderSource) {
            let shaderProgram = this.gl.createProgram();
            let vertShader = this.compileShaderSource(this.gl.VERTEX_SHADER, vertexShaderSource);
            if (!vertShader) {
                (0, cubismdebug_11.CubismLogError)('Vertex shader compile error!');
                return 0;
            }
            let fragShader = this.compileShaderSource(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
            if (!fragShader) {
                (0, cubismdebug_11.CubismLogError)('Fragment shader compile error!');
                return 0;
            }
            this.gl.attachShader(shaderProgram, vertShader);
            this.gl.attachShader(shaderProgram, fragShader);
            this.gl.linkProgram(shaderProgram);
            const linkStatus = this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS);
            if (!linkStatus) {
                (0, cubismdebug_11.CubismLogError)('Failed to link program: {0}', shaderProgram);
                this.gl.deleteShader(vertShader);
                vertShader = 0;
                this.gl.deleteShader(fragShader);
                fragShader = 0;
                if (shaderProgram) {
                    this.gl.deleteProgram(shaderProgram);
                    shaderProgram = 0;
                }
                return 0;
            }
            this.gl.deleteShader(vertShader);
            this.gl.deleteShader(fragShader);
            return shaderProgram;
        }
        compileShaderSource(shaderType, shaderSource) {
            const source = shaderSource;
            const shader = this.gl.createShader(shaderType);
            this.gl.shaderSource(shader, source);
            this.gl.compileShader(shader);
            if (!shader) {
                const log = this.gl.getShaderInfoLog(shader);
                (0, cubismdebug_11.CubismLogError)('Shader compile log: {0} ', log);
            }
            const status = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
            if (!status) {
                const log = this.gl.getShaderInfoLog(shader);
                (0, cubismdebug_11.CubismLogError)('Shader compile log: {0} ', log);
                this.gl.deleteShader(shader);
                return null;
            }
            return shader;
        }
        setGl(gl) {
            this.gl = gl;
        }
        setShaderPath(shaderPath) {
            this._shaderPath = shaderPath;
        }
        getShaderPath() {
            return this._shaderPath;
        }
    }
    exports.CubismShader_WebGL = CubismShader_WebGL;
    class CubismShaderManager_WebGL {
        static getInstance() {
            if (s_instance == null) {
                s_instance = new CubismShaderManager_WebGL();
            }
            return s_instance;
        }
        static deleteInstance() {
            if (s_instance) {
                s_instance.release();
                s_instance = null;
            }
        }
        constructor() {
            this._shaderMap = new Map();
        }
        release() {
            for (const item of this._shaderMap) {
                item[1].release();
            }
            this._shaderMap.clear();
        }
        getShader(gl) {
            return this._shaderMap.get(gl);
        }
        setGlContext(gl) {
            if (!this._shaderMap.has(gl)) {
                const instance = new CubismShader_WebGL();
                instance.setGl(gl);
                this._shaderMap.set(gl, instance);
            }
        }
    }
    exports.CubismShaderManager_WebGL = CubismShaderManager_WebGL;
    class CubismShaderSet {
    }
    exports.CubismShaderSet = CubismShaderSet;
    var ShaderNames;
    (function (ShaderNames) {
        ShaderNames[ShaderNames["ShaderNames_SetupMask"] = 0] = "ShaderNames_SetupMask";
        ShaderNames[ShaderNames["ShaderNames_NormalPremultipliedAlpha"] = 1] = "ShaderNames_NormalPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_NormalMaskedPremultipliedAlpha"] = 2] = "ShaderNames_NormalMaskedPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_NomralMaskedInvertedPremultipliedAlpha"] = 3] = "ShaderNames_NomralMaskedInvertedPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_AddPremultipliedAlpha"] = 4] = "ShaderNames_AddPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_AddMaskedPremultipliedAlpha"] = 5] = "ShaderNames_AddMaskedPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_AddMaskedPremultipliedAlphaInverted"] = 6] = "ShaderNames_AddMaskedPremultipliedAlphaInverted";
        ShaderNames[ShaderNames["ShaderNames_MultPremultipliedAlpha"] = 7] = "ShaderNames_MultPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_MultMaskedPremultipliedAlpha"] = 8] = "ShaderNames_MultMaskedPremultipliedAlpha";
        ShaderNames[ShaderNames["ShaderNames_MultMaskedPremultipliedAlphaInverted"] = 9] = "ShaderNames_MultMaskedPremultipliedAlphaInverted";
        ShaderNames[ShaderNames["ShaderNames_ShaderCount"] = 10] = "ShaderNames_ShaderCount";
    })(ShaderNames || (exports.ShaderNames = ShaderNames = {}));
    var ShaderType;
    (function (ShaderType) {
        ShaderType[ShaderType["ShaderType_Normal"] = 0] = "ShaderType_Normal";
        ShaderType[ShaderType["ShaderType_Masked"] = 1] = "ShaderType_Masked";
        ShaderType[ShaderType["ShaderType_MaskedInverted"] = 2] = "ShaderType_MaskedInverted";
        ShaderType[ShaderType["ShaderType_Count"] = 3] = "ShaderType_Count";
    })(ShaderType || (exports.ShaderType = ShaderType = {}));
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismShaderSet = $.CubismShaderSet;
        Live2DCubismFramework.CubismShader_WebGL = $.CubismShader_WebGL;
        Live2DCubismFramework.CubismShaderManager_WebGL = $.CubismShaderManager_WebGL;
        Live2DCubismFramework.ShaderNames = $.ShaderNames;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/cubismdefaultparameterid", ["require", "exports", "framework/src/cubismdefaultparameterid"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismDefaultParameterId = void 0;
    exports.CubismDefaultParameterId = Object.freeze({
        HitAreaPrefix: 'HitArea',
        HitAreaHead: 'Head',
        HitAreaBody: 'Body',
        PartsIdCore: 'Parts01Core',
        PartsArmPrefix: 'Parts01Arm_',
        PartsArmLPrefix: 'Parts01ArmL_',
        PartsArmRPrefix: 'Parts01ArmR_',
        ParamAngleX: 'ParamAngleX',
        ParamAngleY: 'ParamAngleY',
        ParamAngleZ: 'ParamAngleZ',
        ParamEyeLOpen: 'ParamEyeLOpen',
        ParamEyeLSmile: 'ParamEyeLSmile',
        ParamEyeROpen: 'ParamEyeROpen',
        ParamEyeRSmile: 'ParamEyeRSmile',
        ParamEyeBallX: 'ParamEyeBallX',
        ParamEyeBallY: 'ParamEyeBallY',
        ParamEyeBallForm: 'ParamEyeBallForm',
        ParamBrowLY: 'ParamBrowLY',
        ParamBrowRY: 'ParamBrowRY',
        ParamBrowLX: 'ParamBrowLX',
        ParamBrowRX: 'ParamBrowRX',
        ParamBrowLAngle: 'ParamBrowLAngle',
        ParamBrowRAngle: 'ParamBrowRAngle',
        ParamBrowLForm: 'ParamBrowLForm',
        ParamBrowRForm: 'ParamBrowRForm',
        ParamMouthForm: 'ParamMouthForm',
        ParamMouthOpenY: 'ParamMouthOpenY',
        ParamCheek: 'ParamCheek',
        ParamBodyAngleX: 'ParamBodyAngleX',
        ParamBodyAngleY: 'ParamBodyAngleY',
        ParamBodyAngleZ: 'ParamBodyAngleZ',
        ParamBreath: 'ParamBreath',
        ParamArmLA: 'ParamArmLA',
        ParamArmRA: 'ParamArmRA',
        ParamArmLB: 'ParamArmLB',
        ParamArmRB: 'ParamArmRB',
        ParamHandL: 'ParamHandL',
        ParamHandR: 'ParamHandR',
        ParamHairFront: 'ParamHairFront',
        ParamHairSide: 'ParamHairSide',
        ParamHairBack: 'ParamHairBack',
        ParamHairFluffy: 'ParamHairFluffy',
        ParamShoulderY: 'ParamShoulderY',
        ParamBustX: 'ParamBustX',
        ParamBustY: 'ParamBustY',
        ParamBaseX: 'ParamBaseX',
        ParamBaseY: 'ParamBaseY',
        ParamNONE: 'NONE:'
    });
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.HitAreaBody = $.CubismDefaultParameterId.HitAreaBody;
        Live2DCubismFramework.HitAreaHead = $.CubismDefaultParameterId.HitAreaHead;
        Live2DCubismFramework.HitAreaPrefix = $.CubismDefaultParameterId.HitAreaPrefix;
        Live2DCubismFramework.ParamAngleX = $.CubismDefaultParameterId.ParamAngleX;
        Live2DCubismFramework.ParamAngleY = $.CubismDefaultParameterId.ParamAngleY;
        Live2DCubismFramework.ParamAngleZ = $.CubismDefaultParameterId.ParamAngleZ;
        Live2DCubismFramework.ParamArmLA = $.CubismDefaultParameterId.ParamArmLA;
        Live2DCubismFramework.ParamArmLB = $.CubismDefaultParameterId.ParamArmLB;
        Live2DCubismFramework.ParamArmRA = $.CubismDefaultParameterId.ParamArmRA;
        Live2DCubismFramework.ParamArmRB = $.CubismDefaultParameterId.ParamArmRB;
        Live2DCubismFramework.ParamBaseX = $.CubismDefaultParameterId.ParamBaseX;
        Live2DCubismFramework.ParamBaseY = $.CubismDefaultParameterId.ParamBaseY;
        Live2DCubismFramework.ParamBodyAngleX = $.CubismDefaultParameterId.ParamBodyAngleX;
        Live2DCubismFramework.ParamBodyAngleY = $.CubismDefaultParameterId.ParamBodyAngleY;
        Live2DCubismFramework.ParamBodyAngleZ = $.CubismDefaultParameterId.ParamBodyAngleZ;
        Live2DCubismFramework.ParamBreath = $.CubismDefaultParameterId.ParamBreath;
        Live2DCubismFramework.ParamBrowLAngle = $.CubismDefaultParameterId.ParamBrowLAngle;
        Live2DCubismFramework.ParamBrowLForm = $.CubismDefaultParameterId.ParamBrowLForm;
        Live2DCubismFramework.ParamBrowLX = $.CubismDefaultParameterId.ParamBrowLX;
        Live2DCubismFramework.ParamBrowLY = $.CubismDefaultParameterId.ParamBrowLY;
        Live2DCubismFramework.ParamBrowRAngle = $.CubismDefaultParameterId.ParamBrowRAngle;
        Live2DCubismFramework.ParamBrowRForm = $.CubismDefaultParameterId.ParamBrowRForm;
        Live2DCubismFramework.ParamBrowRX = $.CubismDefaultParameterId.ParamBrowRX;
        Live2DCubismFramework.ParamBrowRY = $.CubismDefaultParameterId.ParamBrowRY;
        Live2DCubismFramework.ParamBustX = $.CubismDefaultParameterId.ParamBustX;
        Live2DCubismFramework.ParamBustY = $.CubismDefaultParameterId.ParamBustY;
        Live2DCubismFramework.ParamCheek = $.CubismDefaultParameterId.ParamCheek;
        Live2DCubismFramework.ParamEyeBallForm = $.CubismDefaultParameterId.ParamEyeBallForm;
        Live2DCubismFramework.ParamEyeBallX = $.CubismDefaultParameterId.ParamEyeBallX;
        Live2DCubismFramework.ParamEyeBallY = $.CubismDefaultParameterId.ParamEyeBallY;
        Live2DCubismFramework.ParamEyeLOpen = $.CubismDefaultParameterId.ParamEyeLOpen;
        Live2DCubismFramework.ParamEyeLSmile = $.CubismDefaultParameterId.ParamEyeLSmile;
        Live2DCubismFramework.ParamEyeROpen = $.CubismDefaultParameterId.ParamEyeROpen;
        Live2DCubismFramework.ParamEyeRSmile = $.CubismDefaultParameterId.ParamEyeRSmile;
        Live2DCubismFramework.ParamHairBack = $.CubismDefaultParameterId.ParamHairBack;
        Live2DCubismFramework.ParamHairFluffy = $.CubismDefaultParameterId.ParamHairFluffy;
        Live2DCubismFramework.ParamHairFront = $.CubismDefaultParameterId.ParamHairFront;
        Live2DCubismFramework.ParamHairSide = $.CubismDefaultParameterId.ParamHairSide;
        Live2DCubismFramework.ParamHandL = $.CubismDefaultParameterId.ParamHandL;
        Live2DCubismFramework.ParamHandR = $.CubismDefaultParameterId.ParamHandR;
        Live2DCubismFramework.ParamMouthForm = $.CubismDefaultParameterId.ParamMouthForm;
        Live2DCubismFramework.ParamMouthOpenY = $.CubismDefaultParameterId.ParamMouthOpenY;
        Live2DCubismFramework.ParamNONE = $.CubismDefaultParameterId.ParamNONE;
        Live2DCubismFramework.ParamShoulderY = $.CubismDefaultParameterId.ParamShoulderY;
        Live2DCubismFramework.PartsArmLPrefix = $.CubismDefaultParameterId.PartsArmLPrefix;
        Live2DCubismFramework.PartsArmPrefix = $.CubismDefaultParameterId.PartsArmPrefix;
        Live2DCubismFramework.PartsArmRPrefix = $.CubismDefaultParameterId.PartsArmRPrefix;
        Live2DCubismFramework.PartsIdCore = $.CubismDefaultParameterId.PartsIdCore;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/icubismmodelsetting", ["require", "exports", "framework/src/icubismmodelsetting"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.ICubismModelSetting = void 0;
    class ICubismModelSetting {
    }
    exports.ICubismModelSetting = ICubismModelSetting;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.ICubismModelSetting = $.ICubismModelSetting;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/cubismmodelsettingjson", ["require", "exports", "framework/src/icubismmodelsetting", "framework/src/live2dcubismframework", "framework/src/utils/cubismjson", "framework/src/cubismmodelsettingjson"], function (require, exports, icubismmodelsetting_1, live2dcubismframework_6, cubismjson_3, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismModelSettingJson = exports.FrequestNode = void 0;
    var FrequestNode;
    (function (FrequestNode) {
        FrequestNode[FrequestNode["FrequestNode_Groups"] = 0] = "FrequestNode_Groups";
        FrequestNode[FrequestNode["FrequestNode_Moc"] = 1] = "FrequestNode_Moc";
        FrequestNode[FrequestNode["FrequestNode_Motions"] = 2] = "FrequestNode_Motions";
        FrequestNode[FrequestNode["FrequestNode_Expressions"] = 3] = "FrequestNode_Expressions";
        FrequestNode[FrequestNode["FrequestNode_Textures"] = 4] = "FrequestNode_Textures";
        FrequestNode[FrequestNode["FrequestNode_Physics"] = 5] = "FrequestNode_Physics";
        FrequestNode[FrequestNode["FrequestNode_Pose"] = 6] = "FrequestNode_Pose";
        FrequestNode[FrequestNode["FrequestNode_HitAreas"] = 7] = "FrequestNode_HitAreas";
    })(FrequestNode || (exports.FrequestNode = FrequestNode = {}));
    class CubismModelSettingJson extends icubismmodelsetting_1.ICubismModelSetting {
        constructor(buffer, size) {
            super();
            this.version = 'Version';
            this.fileReferences = 'FileReferences';
            this.groups = 'Groups';
            this.layout = 'Layout';
            this.hitAreas = 'HitAreas';
            this.moc = 'Moc';
            this.textures = 'Textures';
            this.physics = 'Physics';
            this.pose = 'Pose';
            this.expressions = 'Expressions';
            this.motions = 'Motions';
            this.userData = 'UserData';
            this.name = 'Name';
            this.filePath = 'File';
            this.id = 'Id';
            this.ids = 'Ids';
            this.target = 'Target';
            this.idle = 'Idle';
            this.tapBody = 'TapBody';
            this.pinchIn = 'PinchIn';
            this.pinchOut = 'PinchOut';
            this.shake = 'Shake';
            this.flickHead = 'FlickHead';
            this.parameter = 'Parameter';
            this.soundPath = 'Sound';
            this.fadeInTime = 'FadeInTime';
            this.fadeOutTime = 'FadeOutTime';
            this.centerX = 'CenterX';
            this.centerY = 'CenterY';
            this.x = 'X';
            this.y = 'Y';
            this.width = 'Width';
            this.height = 'Height';
            this.lipSync = 'LipSync';
            this.eyeBlink = 'EyeBlink';
            this.initParameter = 'init_param';
            this.initPartsVisible = 'init_parts_visible';
            this.val = 'val';
            this._json = cubismjson_3.CubismJson.create(buffer, size);
            if (this.getJson()) {
                this._jsonValue = [
                    this.getJson().getRoot().getValueByString(this.groups),
                    this.getJson()
                        .getRoot()
                        .getValueByString(this.fileReferences)
                        .getValueByString(this.moc),
                    this.getJson()
                        .getRoot()
                        .getValueByString(this.fileReferences)
                        .getValueByString(this.motions),
                    this.getJson()
                        .getRoot()
                        .getValueByString(this.fileReferences)
                        .getValueByString(this.expressions),
                    this.getJson()
                        .getRoot()
                        .getValueByString(this.fileReferences)
                        .getValueByString(this.textures),
                    this.getJson()
                        .getRoot()
                        .getValueByString(this.fileReferences)
                        .getValueByString(this.physics),
                    this.getJson()
                        .getRoot()
                        .getValueByString(this.fileReferences)
                        .getValueByString(this.pose),
                    this.getJson().getRoot().getValueByString(this.hitAreas)
                ];
            }
        }
        release() {
            cubismjson_3.CubismJson.delete(this._json);
            this._jsonValue = null;
        }
        getJson() {
            return this._json;
        }
        getModelFileName() {
            if (!this.isExistModelFile()) {
                return '';
            }
            return this._jsonValue[FrequestNode.FrequestNode_Moc].getRawString();
        }
        getTextureCount() {
            if (!this.isExistTextureFiles()) {
                return 0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Textures].getSize();
        }
        getTextureDirectory() {
            const texturePath = this._jsonValue[FrequestNode.FrequestNode_Textures]
                .getValueByIndex(0)
                .getRawString();
            const pathArray = texturePath.split('/');
            const arrayLength = pathArray.length - 1;
            let textureDirectoryStr = '';
            for (let i = 0; i < arrayLength; i++) {
                textureDirectoryStr += pathArray[i];
                if (i < arrayLength - 1) {
                    textureDirectoryStr += '/';
                }
            }
            return textureDirectoryStr;
        }
        getTextureFileName(index) {
            return this._jsonValue[FrequestNode.FrequestNode_Textures]
                .getValueByIndex(index)
                .getRawString();
        }
        getHitAreasCount() {
            if (!this.isExistHitAreas()) {
                return 0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_HitAreas].getSize();
        }
        getHitAreaId(index) {
            return live2dcubismframework_6.CubismFramework.getIdManager().getId(this._jsonValue[FrequestNode.FrequestNode_HitAreas]
                .getValueByIndex(index)
                .getValueByString(this.id)
                .getRawString());
        }
        getHitAreaName(index) {
            return this._jsonValue[FrequestNode.FrequestNode_HitAreas]
                .getValueByIndex(index)
                .getValueByString(this.name)
                .getRawString();
        }
        getPhysicsFileName() {
            if (!this.isExistPhysicsFile()) {
                return '';
            }
            return this._jsonValue[FrequestNode.FrequestNode_Physics].getRawString();
        }
        getPoseFileName() {
            if (!this.isExistPoseFile()) {
                return '';
            }
            return this._jsonValue[FrequestNode.FrequestNode_Pose].getRawString();
        }
        getExpressionCount() {
            if (!this.isExistExpressionFile()) {
                return 0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Expressions].getSize();
        }
        getExpressionName(index) {
            return this._jsonValue[FrequestNode.FrequestNode_Expressions]
                .getValueByIndex(index)
                .getValueByString(this.name)
                .getRawString();
        }
        getExpressionFileName(index) {
            return this._jsonValue[FrequestNode.FrequestNode_Expressions]
                .getValueByIndex(index)
                .getValueByString(this.filePath)
                .getRawString();
        }
        getMotionGroupCount() {
            if (!this.isExistMotionGroups()) {
                return 0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions].getKeys().length;
        }
        getMotionGroupName(index) {
            if (!this.isExistMotionGroups()) {
                return null;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions].getKeys()[index];
        }
        getMotionCount(groupName) {
            if (!this.isExistMotionGroupName(groupName)) {
                return 0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getSize();
        }
        getMotionFileName(groupName, index) {
            if (!this.isExistMotionGroupName(groupName)) {
                return '';
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.filePath)
                .getRawString();
        }
        getMotionSoundFileName(groupName, index) {
            if (!this.isExistMotionSoundFile(groupName, index)) {
                return '';
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.soundPath)
                .getRawString();
        }
        getMotionFadeInTimeValue(groupName, index) {
            if (!this.isExistMotionFadeIn(groupName, index)) {
                return -1.0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.fadeInTime)
                .toFloat();
        }
        getMotionFadeOutTimeValue(groupName, index) {
            if (!this.isExistMotionFadeOut(groupName, index)) {
                return -1.0;
            }
            return this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.fadeOutTime)
                .toFloat();
        }
        getUserDataFile() {
            if (!this.isExistUserDataFile()) {
                return '';
            }
            return this.getJson()
                .getRoot()
                .getValueByString(this.fileReferences)
                .getValueByString(this.userData)
                .getRawString();
        }
        getLayoutMap(outLayoutMap) {
            const map = this.getJson()
                .getRoot()
                .getValueByString(this.layout)
                .getMap();
            if (map == null) {
                return false;
            }
            let ret = false;
            for (const element of map) {
                outLayoutMap.set(element[0], element[1].toFloat());
                ret = true;
            }
            return ret;
        }
        getEyeBlinkParameterCount() {
            if (!this.isExistEyeBlinkParameters()) {
                return 0;
            }
            let num = 0;
            for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
                const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
                if (refI.isNull() || refI.isError()) {
                    continue;
                }
                if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
                    num = refI.getValueByString(this.ids).getVector().length;
                    break;
                }
            }
            return num;
        }
        getEyeBlinkParameterId(index) {
            if (!this.isExistEyeBlinkParameters()) {
                return null;
            }
            for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
                const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
                if (refI.isNull() || refI.isError()) {
                    continue;
                }
                if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
                    return live2dcubismframework_6.CubismFramework.getIdManager().getId(refI.getValueByString(this.ids).getValueByIndex(index).getRawString());
                }
            }
            return null;
        }
        getLipSyncParameterCount() {
            if (!this.isExistLipSyncParameters()) {
                return 0;
            }
            let num = 0;
            for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
                const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
                if (refI.isNull() || refI.isError()) {
                    continue;
                }
                if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
                    num = refI.getValueByString(this.ids).getVector().length;
                    break;
                }
            }
            return num;
        }
        getLipSyncParameterId(index) {
            if (!this.isExistLipSyncParameters()) {
                return null;
            }
            for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
                const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
                if (refI.isNull() || refI.isError()) {
                    continue;
                }
                if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
                    return live2dcubismframework_6.CubismFramework.getIdManager().getId(refI.getValueByString(this.ids).getValueByIndex(index).getRawString());
                }
            }
            return null;
        }
        isExistModelFile() {
            const node = this._jsonValue[FrequestNode.FrequestNode_Moc];
            return !node.isNull() && !node.isError();
        }
        isExistTextureFiles() {
            const node = this._jsonValue[FrequestNode.FrequestNode_Textures];
            return !node.isNull() && !node.isError();
        }
        isExistHitAreas() {
            const node = this._jsonValue[FrequestNode.FrequestNode_HitAreas];
            return !node.isNull() && !node.isError();
        }
        isExistPhysicsFile() {
            const node = this._jsonValue[FrequestNode.FrequestNode_Physics];
            return !node.isNull() && !node.isError();
        }
        isExistPoseFile() {
            const node = this._jsonValue[FrequestNode.FrequestNode_Pose];
            return !node.isNull() && !node.isError();
        }
        isExistExpressionFile() {
            const node = this._jsonValue[FrequestNode.FrequestNode_Expressions];
            return !node.isNull() && !node.isError();
        }
        isExistMotionGroups() {
            const node = this._jsonValue[FrequestNode.FrequestNode_Motions];
            return !node.isNull() && !node.isError();
        }
        isExistMotionGroupName(groupName) {
            const node = this._jsonValue[FrequestNode.FrequestNode_Motions].getValueByString(groupName);
            return !node.isNull() && !node.isError();
        }
        isExistMotionSoundFile(groupName, index) {
            const node = this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.soundPath);
            return !node.isNull() && !node.isError();
        }
        isExistMotionFadeIn(groupName, index) {
            const node = this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.fadeInTime);
            return !node.isNull() && !node.isError();
        }
        isExistMotionFadeOut(groupName, index) {
            const node = this._jsonValue[FrequestNode.FrequestNode_Motions]
                .getValueByString(groupName)
                .getValueByIndex(index)
                .getValueByString(this.fadeOutTime);
            return !node.isNull() && !node.isError();
        }
        isExistUserDataFile() {
            const node = this.getJson()
                .getRoot()
                .getValueByString(this.fileReferences)
                .getValueByString(this.userData);
            return !node.isNull() && !node.isError();
        }
        isExistEyeBlinkParameters() {
            if (this._jsonValue[FrequestNode.FrequestNode_Groups].isNull() ||
                this._jsonValue[FrequestNode.FrequestNode_Groups].isError()) {
                return false;
            }
            for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); ++i) {
                if (this._jsonValue[FrequestNode.FrequestNode_Groups]
                    .getValueByIndex(i)
                    .getValueByString(this.name)
                    .getRawString() == this.eyeBlink) {
                    return true;
                }
            }
            return false;
        }
        isExistLipSyncParameters() {
            if (this._jsonValue[FrequestNode.FrequestNode_Groups].isNull() ||
                this._jsonValue[FrequestNode.FrequestNode_Groups].isError()) {
                return false;
            }
            for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); ++i) {
                if (this._jsonValue[FrequestNode.FrequestNode_Groups]
                    .getValueByIndex(i)
                    .getValueByString(this.name)
                    .getRawString() == this.lipSync) {
                    return true;
                }
            }
            return false;
        }
    }
    exports.CubismModelSettingJson = CubismModelSettingJson;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismModelSettingJson = $.CubismModelSettingJson;
        Live2DCubismFramework.FrequestNode = $.FrequestNode;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/effect/cubismbreath", ["require", "exports", "framework/src/effect/cubismbreath"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.BreathParameterData = exports.CubismBreath = void 0;
    class CubismBreath {
        static create() {
            return new CubismBreath();
        }
        static delete(instance) {
            if (instance != null) {
                instance = null;
            }
        }
        setParameters(breathParameters) {
            this._breathParameters = breathParameters;
        }
        getParameters() {
            return this._breathParameters;
        }
        updateParameters(model, deltaTimeSeconds) {
            this._currentTime += deltaTimeSeconds;
            const t = this._currentTime * 2.0 * Math.PI;
            for (let i = 0; i < this._breathParameters.length; ++i) {
                const data = this._breathParameters[i];
                model.addParameterValueById(data.parameterId, data.offset + data.peak * Math.sin(t / data.cycle), data.weight);
            }
        }
        constructor() {
            this._currentTime = 0.0;
        }
    }
    exports.CubismBreath = CubismBreath;
    class BreathParameterData {
        constructor(parameterId, offset, peak, cycle, weight) {
            this.parameterId = parameterId == undefined ? null : parameterId;
            this.offset = offset == undefined ? 0.0 : offset;
            this.peak = peak == undefined ? 0.0 : peak;
            this.cycle = cycle == undefined ? 0.0 : cycle;
            this.weight = weight == undefined ? 0.0 : weight;
        }
    }
    exports.BreathParameterData = BreathParameterData;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.BreathParameterData = $.BreathParameterData;
        Live2DCubismFramework.CubismBreath = $.CubismBreath;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/effect/cubismeyeblink", ["require", "exports", "framework/src/effect/cubismeyeblink"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.EyeState = exports.CubismEyeBlink = void 0;
    class CubismEyeBlink {
        static create(modelSetting = null) {
            return new CubismEyeBlink(modelSetting);
        }
        static delete(eyeBlink) {
            if (eyeBlink != null) {
                eyeBlink = null;
            }
        }
        setBlinkingInterval(blinkingInterval) {
            this._blinkingIntervalSeconds = blinkingInterval;
        }
        setBlinkingSetting(closing, closed, opening) {
            this._closingSeconds = closing;
            this._closedSeconds = closed;
            this._openingSeconds = opening;
        }
        setParameterIds(parameterIds) {
            this._parameterIds = parameterIds;
        }
        getParameterIds() {
            return this._parameterIds;
        }
        updateParameters(model, deltaTimeSeconds) {
            this._userTimeSeconds += deltaTimeSeconds;
            let parameterValue;
            let t = 0.0;
            const blinkingState = this._blinkingState;
            switch (blinkingState) {
                case EyeState.EyeState_Closing:
                    t =
                        (this._userTimeSeconds - this._stateStartTimeSeconds) /
                            this._closingSeconds;
                    if (t >= 1.0) {
                        t = 1.0;
                        this._blinkingState = EyeState.EyeState_Closed;
                        this._stateStartTimeSeconds = this._userTimeSeconds;
                    }
                    parameterValue = 1.0 - t;
                    break;
                case EyeState.EyeState_Closed:
                    t =
                        (this._userTimeSeconds - this._stateStartTimeSeconds) /
                            this._closedSeconds;
                    if (t >= 1.0) {
                        this._blinkingState = EyeState.EyeState_Opening;
                        this._stateStartTimeSeconds = this._userTimeSeconds;
                    }
                    parameterValue = 0.0;
                    break;
                case EyeState.EyeState_Opening:
                    t =
                        (this._userTimeSeconds - this._stateStartTimeSeconds) /
                            this._openingSeconds;
                    if (t >= 1.0) {
                        t = 1.0;
                        this._blinkingState = EyeState.EyeState_Interval;
                        this._nextBlinkingTime = this.determinNextBlinkingTiming();
                    }
                    parameterValue = t;
                    break;
                case EyeState.EyeState_Interval:
                    if (this._nextBlinkingTime < this._userTimeSeconds) {
                        this._blinkingState = EyeState.EyeState_Closing;
                        this._stateStartTimeSeconds = this._userTimeSeconds;
                    }
                    parameterValue = 1.0;
                    break;
                case EyeState.EyeState_First:
                default:
                    this._blinkingState = EyeState.EyeState_Interval;
                    this._nextBlinkingTime = this.determinNextBlinkingTiming();
                    parameterValue = 1.0;
                    break;
            }
            if (!CubismEyeBlink.CloseIfZero) {
                parameterValue = -parameterValue;
            }
            for (let i = 0; i < this._parameterIds.length; ++i) {
                model.setParameterValueById(this._parameterIds[i], parameterValue);
            }
        }
        constructor(modelSetting) {
            this._blinkingState = EyeState.EyeState_First;
            this._nextBlinkingTime = 0.0;
            this._stateStartTimeSeconds = 0.0;
            this._blinkingIntervalSeconds = 4.0;
            this._closingSeconds = 0.1;
            this._closedSeconds = 0.05;
            this._openingSeconds = 0.15;
            this._userTimeSeconds = 0.0;
            this._parameterIds = new Array();
            if (modelSetting == null) {
                return;
            }
            this._parameterIds.length = modelSetting.getEyeBlinkParameterCount();
            for (let i = 0; i < modelSetting.getEyeBlinkParameterCount(); ++i) {
                this._parameterIds[i] = modelSetting.getEyeBlinkParameterId(i);
            }
        }
        determinNextBlinkingTiming() {
            const r = Math.random();
            return (this._userTimeSeconds + r * (2.0 * this._blinkingIntervalSeconds - 1.0));
        }
    }
    exports.CubismEyeBlink = CubismEyeBlink;
    CubismEyeBlink.CloseIfZero = true;
    var EyeState;
    (function (EyeState) {
        EyeState[EyeState["EyeState_First"] = 0] = "EyeState_First";
        EyeState[EyeState["EyeState_Interval"] = 1] = "EyeState_Interval";
        EyeState[EyeState["EyeState_Closing"] = 2] = "EyeState_Closing";
        EyeState[EyeState["EyeState_Closed"] = 3] = "EyeState_Closed";
        EyeState[EyeState["EyeState_Opening"] = 4] = "EyeState_Opening";
    })(EyeState || (exports.EyeState = EyeState = {}));
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismEyeBlink = $.CubismEyeBlink;
        Live2DCubismFramework.EyeState = $.EyeState;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/effect/cubismlook", ["require", "exports", "framework/src/effect/cubismlook"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.LookParameterData = exports.CubismLook = void 0;
    class CubismLook {
        static create() {
            return new CubismLook();
        }
        static delete(instance) {
            if (instance != null) {
                instance = null;
            }
        }
        setParameters(lookParameters) {
            this._lookParameters = lookParameters;
        }
        getParameters() {
            return this._lookParameters;
        }
        updateParameters(model, dragX, dragY) {
            for (let i = 0; i < this._lookParameters.length; ++i) {
                const data = this._lookParameters[i];
                model.addParameterValueById(data.parameterId, data.factorX * dragX +
                    data.factorY * dragY +
                    data.factorXY * dragX * dragY);
            }
        }
        constructor() {
            this._lookParameters = new Array();
        }
    }
    exports.CubismLook = CubismLook;
    class LookParameterData {
        constructor(parameterId, factorX, factorY, factorXY) {
            this.parameterId = parameterId == undefined ? null : parameterId;
            this.factorX = factorX == undefined ? 0.0 : factorX;
            this.factorY = factorY == undefined ? 0.0 : factorY;
            this.factorXY = factorXY == undefined ? 0.0 : factorXY;
        }
    }
    exports.LookParameterData = LookParameterData;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.LookParameterData = $.LookParameterData;
        Live2DCubismFramework.CubismLook = $.CubismLook;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/model/cubismmoc", ["require", "exports", "framework/src/utils/cubismdebug", "framework/src/model/cubismmodel", "framework/src/model/cubismmoc"], function (require, exports, cubismdebug_12, cubismmodel_4, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMoc = void 0;
    class CubismMoc {
        static create(mocBytes, shouldCheckMocConsistency) {
            let cubismMoc = null;
            if (shouldCheckMocConsistency) {
                const consistency = this.hasMocConsistency(mocBytes);
                if (!consistency) {
                    (0, cubismdebug_12.CubismLogError)(`Inconsistent MOC3.`);
                    return cubismMoc;
                }
            }
            const moc = Live2DCubismCore.Moc.fromArrayBuffer(mocBytes);
            if (moc) {
                cubismMoc = new CubismMoc(moc);
                cubismMoc._mocVersion =
                    Live2DCubismCore.Version.csmGetMocVersion(mocBytes);
            }
            return cubismMoc;
        }
        static delete(moc) {
            moc._moc._release();
            moc._moc = null;
            moc = null;
        }
        createModel() {
            let cubismModel = null;
            const model = Live2DCubismCore.Model.fromMoc(this._moc);
            if (model) {
                cubismModel = new cubismmodel_4.CubismModel(model);
                cubismModel.initialize();
                ++this._modelCount;
            }
            return cubismModel;
        }
        deleteModel(model) {
            if (model != null) {
                model.release();
                model = null;
                --this._modelCount;
            }
        }
        constructor(moc) {
            this._moc = moc;
            this._modelCount = 0;
            this._mocVersion = 0;
        }
        release() {
            (0, cubismdebug_12.CSM_ASSERT)(this._modelCount == 0);
            this._moc._release();
            this._moc = null;
        }
        getLatestMocVersion() {
            return Live2DCubismCore.Version.csmGetLatestMocVersion();
        }
        getMocVersion() {
            return this._mocVersion;
        }
        static getMocVersionFromBuffer(mocBytes) {
            return Live2DCubismCore.Version.csmGetMocVersion(mocBytes);
        }
        static hasMocConsistency(mocBytes) {
            const isConsistent = Live2DCubismCore.Moc.prototype.hasMocConsistency(mocBytes);
            return isConsistent === 1 ? true : false;
        }
    }
    exports.CubismMoc = CubismMoc;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMoc = $.CubismMoc;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/effect/cubismpose", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/utils/cubismjson", "framework/src/effect/cubismpose"], function (require, exports, live2dcubismframework_7, cubismjson_4, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.PartData = exports.CubismPose = void 0;
    const Epsilon = 0.001;
    const DefaultFadeInSeconds = 0.5;
    const FadeIn = 'FadeInTime';
    const Link = 'Link';
    const Groups = 'Groups';
    const Id = 'Id';
    class CubismPose {
        static create(pose3json, size) {
            const json = cubismjson_4.CubismJson.create(pose3json, size);
            if (!json) {
                return null;
            }
            const ret = new CubismPose();
            const root = json.getRoot();
            if (!root.getValueByString(FadeIn).isNull()) {
                ret._fadeTimeSeconds = root
                    .getValueByString(FadeIn)
                    .toFloat(DefaultFadeInSeconds);
                if (ret._fadeTimeSeconds < 0.0) {
                    ret._fadeTimeSeconds = DefaultFadeInSeconds;
                }
            }
            const poseListInfo = root.getValueByString(Groups);
            const poseCount = poseListInfo.getSize();
            ret._partGroupCounts.length = poseCount;
            for (let poseIndex = 0; poseIndex < poseCount; ++poseIndex) {
                const idListInfo = poseListInfo.getValueByIndex(poseIndex);
                const idCount = idListInfo.getSize();
                let groupCount = 0;
                for (let groupIndex = 0; groupIndex < idCount; ++groupIndex) {
                    const partInfo = idListInfo.getValueByIndex(groupIndex);
                    const partData = new PartData();
                    const parameterId = live2dcubismframework_7.CubismFramework.getIdManager().getId(partInfo.getValueByString(Id).getRawString());
                    partData.partId = parameterId;
                    if (!partInfo.getValueByString(Link).isNull()) {
                        const linkListInfo = partInfo.getValueByString(Link);
                        const linkCount = linkListInfo.getSize();
                        for (let linkIndex = 0; linkIndex < linkCount; ++linkIndex) {
                            const linkPart = new PartData();
                            const linkId = live2dcubismframework_7.CubismFramework.getIdManager().getId(linkListInfo.getValueByIndex(linkIndex).getString());
                            linkPart.partId = linkId;
                            partData.link.push(linkPart);
                        }
                    }
                    ret._partGroups.push(partData.clone());
                    ++groupCount;
                }
                ret._partGroupCounts[poseIndex] = groupCount;
            }
            cubismjson_4.CubismJson.delete(json);
            return ret;
        }
        static delete(pose) {
            if (pose != null) {
                pose = null;
            }
        }
        updateParameters(model, deltaTimeSeconds) {
            if (model != this._lastModel) {
                this.reset(model);
            }
            this._lastModel = model;
            if (deltaTimeSeconds < 0.0) {
                deltaTimeSeconds = 0.0;
            }
            let beginIndex = 0;
            for (let i = 0; i < this._partGroupCounts.length; i++) {
                const partGroupCount = this._partGroupCounts[i];
                this.doFade(model, deltaTimeSeconds, beginIndex, partGroupCount);
                beginIndex += partGroupCount;
            }
            this.copyPartOpacities(model);
        }
        reset(model) {
            let beginIndex = 0;
            for (let i = 0; i < this._partGroupCounts.length; ++i) {
                const groupCount = this._partGroupCounts[i];
                for (let j = beginIndex; j < beginIndex + groupCount; ++j) {
                    this._partGroups[j].initialize(model);
                    const partsIndex = this._partGroups[j].partIndex;
                    const paramIndex = this._partGroups[j].parameterIndex;
                    if (partsIndex < 0) {
                        continue;
                    }
                    model.setPartOpacityByIndex(partsIndex, j == beginIndex ? 1.0 : 0.0);
                    model.setParameterValueByIndex(paramIndex, j == beginIndex ? 1.0 : 0.0);
                    for (let k = 0; k < this._partGroups[j].link.length; ++k) {
                        this._partGroups[j].link[k].initialize(model);
                    }
                }
                beginIndex += groupCount;
            }
        }
        copyPartOpacities(model) {
            for (let groupIndex = 0; groupIndex < this._partGroups.length; ++groupIndex) {
                const partData = this._partGroups[groupIndex];
                if (partData.link.length == 0) {
                    continue;
                }
                const partIndex = this._partGroups[groupIndex].partIndex;
                const opacity = model.getPartOpacityByIndex(partIndex);
                for (let linkIndex = 0; linkIndex < partData.link.length; ++linkIndex) {
                    const linkPart = partData.link[linkIndex];
                    const linkPartIndex = linkPart.partIndex;
                    if (linkPartIndex < 0) {
                        continue;
                    }
                    model.setPartOpacityByIndex(linkPartIndex, opacity);
                }
            }
        }
        doFade(model, deltaTimeSeconds, beginIndex, partGroupCount) {
            let visiblePartIndex = -1;
            let newOpacity = 1.0;
            const phi = 0.5;
            const backOpacityThreshold = 0.15;
            for (let i = beginIndex; i < beginIndex + partGroupCount; ++i) {
                const partIndex = this._partGroups[i].partIndex;
                const paramIndex = this._partGroups[i].parameterIndex;
                if (model.getParameterValueByIndex(paramIndex) > Epsilon) {
                    if (visiblePartIndex >= 0) {
                        break;
                    }
                    visiblePartIndex = i;
                    if (this._fadeTimeSeconds == 0) {
                        newOpacity = 1.0;
                        continue;
                    }
                    newOpacity = model.getPartOpacityByIndex(partIndex);
                    newOpacity += deltaTimeSeconds / this._fadeTimeSeconds;
                    if (newOpacity > 1.0) {
                        newOpacity = 1.0;
                    }
                }
            }
            if (visiblePartIndex < 0) {
                visiblePartIndex = 0;
                newOpacity = 1.0;
            }
            for (let i = beginIndex; i < beginIndex + partGroupCount; ++i) {
                const partsIndex = this._partGroups[i].partIndex;
                if (visiblePartIndex == i) {
                    model.setPartOpacityByIndex(partsIndex, newOpacity);
                }
                else {
                    let opacity = model.getPartOpacityByIndex(partsIndex);
                    let a1;
                    if (newOpacity < phi) {
                        a1 = (newOpacity * (phi - 1)) / phi + 1.0;
                    }
                    else {
                        a1 = ((1 - newOpacity) * phi) / (1.0 - phi);
                    }
                    const backOpacity = (1.0 - a1) * (1.0 - newOpacity);
                    if (backOpacity > backOpacityThreshold) {
                        a1 = 1.0 - backOpacityThreshold / (1.0 - newOpacity);
                    }
                    if (opacity > a1) {
                        opacity = a1;
                    }
                    model.setPartOpacityByIndex(partsIndex, opacity);
                }
            }
        }
        constructor() {
            this._fadeTimeSeconds = DefaultFadeInSeconds;
            this._lastModel = null;
            this._partGroups = new Array();
            this._partGroupCounts = new Array();
        }
    }
    exports.CubismPose = CubismPose;
    class PartData {
        constructor(v) {
            this.parameterIndex = 0;
            this.partIndex = 0;
            this.link = new Array();
            if (v != undefined) {
                this.partId = v.partId;
                this.link.length = v.link.length;
                for (let i = 0; i < v.link.length; i++) {
                    this.link[i] = v.link[i].clone();
                }
            }
        }
        assignment(v) {
            this.partId = v.partId;
            let dstIndex = this.link.length;
            this.link.length += v.link.length;
            for (const partData of v.link) {
                this.link[dstIndex++] = partData.clone();
            }
            return this;
        }
        initialize(model) {
            this.parameterIndex = model.getParameterIndex(this.partId);
            this.partIndex = model.getPartIndex(this.partId);
            model.setParameterValueByIndex(this.parameterIndex, 1);
        }
        clone() {
            const clonePartData = new PartData();
            clonePartData.partId = this.partId;
            clonePartData.parameterIndex = this.parameterIndex;
            clonePartData.partIndex = this.partIndex;
            clonePartData.link = new Array();
            clonePartData.link.length = this.link.length;
            for (let i = 0; i < this.link.length; i++) {
                clonePartData.link[i] = this.link[i].clone();
            }
            return clonePartData;
        }
    }
    exports.PartData = PartData;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismPose = $.CubismPose;
        Live2DCubismFramework.PartData = $.PartData;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/math/cubismmodelmatrix", ["require", "exports", "framework/src/math/cubismmatrix44", "framework/src/math/cubismmodelmatrix"], function (require, exports, cubismmatrix44_4, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismModelMatrix = void 0;
    class CubismModelMatrix extends cubismmatrix44_4.CubismMatrix44 {
        constructor(w, h) {
            super();
            this._width = w !== undefined ? w : 0.0;
            this._height = h !== undefined ? h : 0.0;
            this.setHeight(2.0);
        }
        setWidth(w) {
            const scaleX = w / this._width;
            const scaleY = scaleX;
            this.scale(scaleX, scaleY);
        }
        setHeight(h) {
            const scaleX = h / this._height;
            const scaleY = scaleX;
            this.scale(scaleX, scaleY);
        }
        setPosition(x, y) {
            this.translate(x, y);
        }
        setCenterPosition(x, y) {
            this.centerX(x);
            this.centerY(y);
        }
        top(y) {
            this.setY(y);
        }
        bottom(y) {
            const h = this._height * this.getScaleY();
            this.translateY(y - h);
        }
        left(x) {
            this.setX(x);
        }
        right(x) {
            const w = this._width * this.getScaleX();
            this.translateX(x - w);
        }
        centerX(x) {
            const w = this._width * this.getScaleX();
            this.translateX(x - w / 2.0);
        }
        setX(x) {
            this.translateX(x);
        }
        centerY(y) {
            const h = this._height * this.getScaleY();
            this.translateY(y - h / 2.0);
        }
        setY(y) {
            this.translateY(y);
        }
        setupFromLayout(layout) {
            const keyWidth = 'width';
            const keyHeight = 'height';
            const keyX = 'x';
            const keyY = 'y';
            const keyCenterX = 'center_x';
            const keyCenterY = 'center_y';
            const keyTop = 'top';
            const keyBottom = 'bottom';
            const keyLeft = 'left';
            const keyRight = 'right';
            for (const item of layout) {
                const key = item[0];
                const value = item[1];
                if (key == keyWidth) {
                    this.setWidth(value);
                }
                else if (key == keyHeight) {
                    this.setHeight(value);
                }
            }
            for (const item of layout) {
                const key = item[0];
                const value = item[1];
                if (key == keyX) {
                    this.setX(value);
                }
                else if (key == keyY) {
                    this.setY(value);
                }
                else if (key == keyCenterX) {
                    this.centerX(value);
                }
                else if (key == keyCenterY) {
                    this.centerY(value);
                }
                else if (key == keyTop) {
                    this.top(value);
                }
                else if (key == keyBottom) {
                    this.bottom(value);
                }
                else if (key == keyLeft) {
                    this.left(value);
                }
                else if (key == keyRight) {
                    this.right(value);
                }
            }
        }
    }
    exports.CubismModelMatrix = CubismModelMatrix;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismModelMatrix = $.CubismModelMatrix;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/math/cubismtargetpoint", ["require", "exports", "framework/src/math/cubismmath", "framework/src/math/cubismtargetpoint"], function (require, exports, cubismmath_4, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismTargetPoint = void 0;
    const FrameRate = 30;
    const Epsilon = 0.01;
    class CubismTargetPoint {
        constructor() {
            this._faceTargetX = 0.0;
            this._faceTargetY = 0.0;
            this._faceX = 0.0;
            this._faceY = 0.0;
            this._faceVX = 0.0;
            this._faceVY = 0.0;
            this._lastTimeSeconds = 0.0;
            this._userTimeSeconds = 0.0;
        }
        update(deltaTimeSeconds) {
            this._userTimeSeconds += deltaTimeSeconds;
            const faceParamMaxV = 40.0 / 10.0;
            const maxV = (faceParamMaxV * 1.0) / FrameRate;
            if (this._lastTimeSeconds == 0.0) {
                this._lastTimeSeconds = this._userTimeSeconds;
                return;
            }
            const deltaTimeWeight = (this._userTimeSeconds - this._lastTimeSeconds) * FrameRate;
            this._lastTimeSeconds = this._userTimeSeconds;
            const timeToMaxSpeed = 0.15;
            const frameToMaxSpeed = timeToMaxSpeed * FrameRate;
            const maxA = (deltaTimeWeight * maxV) / frameToMaxSpeed;
            const dx = this._faceTargetX - this._faceX;
            const dy = this._faceTargetY - this._faceY;
            if (cubismmath_4.CubismMath.abs(dx) <= Epsilon && cubismmath_4.CubismMath.abs(dy) <= Epsilon) {
                return;
            }
            const d = cubismmath_4.CubismMath.sqrt(dx * dx + dy * dy);
            const vx = (maxV * dx) / d;
            const vy = (maxV * dy) / d;
            let ax = vx - this._faceVX;
            let ay = vy - this._faceVY;
            const a = cubismmath_4.CubismMath.sqrt(ax * ax + ay * ay);
            if (a < -maxA || a > maxA) {
                ax *= maxA / a;
                ay *= maxA / a;
            }
            this._faceVX += ax;
            this._faceVY += ay;
            {
                const maxV = 0.5 *
                    (cubismmath_4.CubismMath.sqrt(maxA * maxA + 16.0 * maxA * d - 8.0 * maxA * d) -
                        maxA);
                const curV = cubismmath_4.CubismMath.sqrt(this._faceVX * this._faceVX + this._faceVY * this._faceVY);
                if (curV > maxV) {
                    this._faceVX *= maxV / curV;
                    this._faceVY *= maxV / curV;
                }
            }
            this._faceX += this._faceVX;
            this._faceY += this._faceVY;
        }
        getX() {
            return this._faceX;
        }
        getY() {
            return this._faceY;
        }
        set(x, y) {
            this._faceTargetX = x;
            this._faceTargetY = y;
        }
    }
    exports.CubismTargetPoint = CubismTargetPoint;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismTargetPoint = $.CubismTargetPoint;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismmotionqueuemanager", ["require", "exports", "framework/src/motion/cubismmotionqueueentry", "framework/src/motion/cubismmotionqueuemanager"], function (require, exports, cubismmotionqueueentry_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.InvalidMotionQueueEntryHandleValue = exports.CubismMotionQueueManager = void 0;
    class CubismMotionQueueManager {
        constructor() {
            this._userTimeSeconds = 0.0;
            this._eventCallBack = null;
            this._eventCustomData = null;
            this._motions = new Array();
        }
        release() {
            for (let i = 0; i < this._motions.length; ++i) {
                if (this._motions[i]) {
                    this._motions[i].release();
                    this._motions[i] = null;
                }
            }
            this._motions = null;
        }
        startMotion(motion, autoDelete, userTimeSeconds) {
            if (motion == null) {
                return exports.InvalidMotionQueueEntryHandleValue;
            }
            let motionQueueEntry = null;
            for (let i = 0; i < this._motions.length; ++i) {
                motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    continue;
                }
                motionQueueEntry.setFadeOut(motionQueueEntry._motion.getFadeOutTime());
            }
            motionQueueEntry = new cubismmotionqueueentry_1.CubismMotionQueueEntry();
            motionQueueEntry._autoDelete = autoDelete;
            motionQueueEntry._motion = motion;
            this._motions.push(motionQueueEntry);
            return motionQueueEntry._motionQueueEntryHandle;
        }
        isFinished() {
            for (let i = 0; i < this._motions.length;) {
                let motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    this._motions.splice(i, 1);
                    continue;
                }
                const motion = motionQueueEntry._motion;
                if (motion == null) {
                    motionQueueEntry.release();
                    motionQueueEntry = null;
                    this._motions.splice(i, 1);
                    continue;
                }
                if (!motionQueueEntry.isFinished()) {
                    return false;
                }
                else {
                    i++;
                }
            }
            return true;
        }
        isFinishedByHandle(motionQueueEntryNumber) {
            for (let i = 0; i < this._motions.length; i++) {
                const motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    continue;
                }
                if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber &&
                    !motionQueueEntry.isFinished()) {
                    return false;
                }
            }
            return true;
        }
        stopAllMotions() {
            for (let i = 0; i < this._motions.length; i++) {
                const motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    this._motions.splice(i, 1);
                    continue;
                }
                motionQueueEntry.release();
                this._motions.splice(i, 1);
                continue;
            }
        }
        getCubismMotionQueueEntries() {
            return this._motions;
        }
        getCubismMotionQueueEntry(motionQueueEntryNumber) {
            for (let i = 0; i < this._motions.length; i++) {
                const motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    continue;
                }
                if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber) {
                    return motionQueueEntry;
                }
            }
            return null;
        }
        setEventCallback(callback, customData = null) {
            this._eventCallBack = callback;
            this._eventCustomData = customData;
        }
        doUpdateMotion(model, userTimeSeconds) {
            let updated = false;
            for (let i = 0; i < this._motions.length;) {
                let motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    this._motions.splice(i, 1);
                    continue;
                }
                const motion = motionQueueEntry._motion;
                if (motion == null) {
                    motionQueueEntry.release();
                    motionQueueEntry = null;
                    this._motions.splice(i, 1);
                    continue;
                }
                motion.updateParameters(model, motionQueueEntry, userTimeSeconds);
                updated = true;
                const firedList = motion.getFiredEvent(motionQueueEntry.getLastCheckEventSeconds() -
                    motionQueueEntry.getStartTime(), userTimeSeconds - motionQueueEntry.getStartTime());
                for (let i = 0; i < firedList.length; ++i) {
                    this._eventCallBack(this, firedList[i], this._eventCustomData);
                }
                motionQueueEntry.setLastCheckEventSeconds(userTimeSeconds);
                if (motionQueueEntry.isFinished()) {
                    motionQueueEntry.release();
                    motionQueueEntry = null;
                    this._motions.splice(i, 1);
                }
                else {
                    if (motionQueueEntry.isTriggeredFadeOut()) {
                        motionQueueEntry.startFadeOut(motionQueueEntry.getFadeOutSeconds(), userTimeSeconds);
                    }
                    i++;
                }
            }
            return updated;
        }
    }
    exports.CubismMotionQueueManager = CubismMotionQueueManager;
    exports.InvalidMotionQueueEntryHandleValue = -1;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMotionQueueManager = $.CubismMotionQueueManager;
        Live2DCubismFramework.InvalidMotionQueueEntryHandleValue = $.InvalidMotionQueueEntryHandleValue;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismmotionqueueentry", ["require", "exports", "framework/src/motion/acubismmotion", "framework/src/motion/cubismmotionqueueentry"], function (require, exports, acubismmotion_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMotionQueueEntry = void 0;
    class CubismMotionQueueEntry {
        constructor() {
            this._autoDelete = false;
            this._motion = null;
            this._available = true;
            this._finished = false;
            this._started = false;
            this._startTimeSeconds = -1.0;
            this._fadeInStartTimeSeconds = 0.0;
            this._endTimeSeconds = -1.0;
            this._stateTimeSeconds = 0.0;
            this._stateWeight = 0.0;
            this._lastEventCheckSeconds = 0.0;
            this._motionQueueEntryHandle = this;
            this._fadeOutSeconds = 0.0;
            this._isTriggeredFadeOut = false;
        }
        release() {
            if (this._autoDelete && this._motion) {
                acubismmotion_1.ACubismMotion.delete(this._motion);
            }
        }
        setFadeOut(fadeOutSeconds) {
            this._fadeOutSeconds = fadeOutSeconds;
            this._isTriggeredFadeOut = true;
        }
        startFadeOut(fadeOutSeconds, userTimeSeconds) {
            const newEndTimeSeconds = userTimeSeconds + fadeOutSeconds;
            this._isTriggeredFadeOut = true;
            if (this._endTimeSeconds < 0.0 ||
                newEndTimeSeconds < this._endTimeSeconds) {
                this._endTimeSeconds = newEndTimeSeconds;
            }
        }
        isFinished() {
            return this._finished;
        }
        isStarted() {
            return this._started;
        }
        getStartTime() {
            return this._startTimeSeconds;
        }
        getFadeInStartTime() {
            return this._fadeInStartTimeSeconds;
        }
        getEndTime() {
            return this._endTimeSeconds;
        }
        setStartTime(startTime) {
            this._startTimeSeconds = startTime;
        }
        setFadeInStartTime(startTime) {
            this._fadeInStartTimeSeconds = startTime;
        }
        setEndTime(endTime) {
            this._endTimeSeconds = endTime;
        }
        setIsFinished(f) {
            this._finished = f;
        }
        setIsStarted(f) {
            this._started = f;
        }
        isAvailable() {
            return this._available;
        }
        setIsAvailable(v) {
            this._available = v;
        }
        setState(timeSeconds, weight) {
            this._stateTimeSeconds = timeSeconds;
            this._stateWeight = weight;
        }
        getStateTime() {
            return this._stateTimeSeconds;
        }
        getStateWeight() {
            return this._stateWeight;
        }
        getLastCheckEventSeconds() {
            return this._lastEventCheckSeconds;
        }
        setLastCheckEventSeconds(checkSeconds) {
            this._lastEventCheckSeconds = checkSeconds;
        }
        isTriggeredFadeOut() {
            return this._isTriggeredFadeOut;
        }
        getFadeOutSeconds() {
            return this._fadeOutSeconds;
        }
        getCubismMotion() {
            return this._motion;
        }
    }
    exports.CubismMotionQueueEntry = CubismMotionQueueEntry;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMotionQueueEntry = $.CubismMotionQueueEntry;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/acubismmotion", ["require", "exports", "framework/src/math/cubismmath", "framework/src/utils/cubismdebug", "framework/src/motion/acubismmotion", "framework/src/live2dcubismframework"], function (require, exports, cubismmath_5, cubismdebug_13, $, live2dcubismframework_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.ACubismMotion = void 0;
    class ACubismMotion {
        static delete(motion) {
            motion.release();
            motion = null;
        }
        constructor() {
            this.setBeganMotionHandler = (onBeganMotionHandler) => (this._onBeganMotion = onBeganMotionHandler);
            this.getBeganMotionHandler = () => this._onBeganMotion;
            this.setFinishedMotionHandler = (onFinishedMotionHandler) => (this._onFinishedMotion = onFinishedMotionHandler);
            this.getFinishedMotionHandler = () => this._onFinishedMotion;
            this._fadeInSeconds = -1.0;
            this._fadeOutSeconds = -1.0;
            this._weight = 1.0;
            this._offsetSeconds = 0.0;
            this._isLoop = false;
            this._isLoopFadeIn = true;
            this._previousLoopState = this._isLoop;
            this._firedEventValues = new Array();
        }
        release() {
            this._weight = 0.0;
        }
        updateParameters(model, motionQueueEntry, userTimeSeconds) {
            if (!motionQueueEntry.isAvailable() || motionQueueEntry.isFinished()) {
                return;
            }
            this.setupMotionQueueEntry(motionQueueEntry, userTimeSeconds);
            const fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);
            this.doUpdateParameters(model, userTimeSeconds, fadeWeight, motionQueueEntry);
            if (motionQueueEntry.getEndTime() > 0 &&
                motionQueueEntry.getEndTime() < userTimeSeconds) {
                motionQueueEntry.setIsFinished(true);
            }
        }
        setupMotionQueueEntry(motionQueueEntry, userTimeSeconds) {
            if (motionQueueEntry == null || motionQueueEntry.isStarted()) {
                return;
            }
            if (!motionQueueEntry.isAvailable()) {
                return;
            }
            motionQueueEntry.setIsStarted(true);
            motionQueueEntry.setStartTime(userTimeSeconds - this._offsetSeconds);
            motionQueueEntry.setFadeInStartTime(userTimeSeconds);
            if (motionQueueEntry.getEndTime() < 0.0) {
                this.adjustEndTime(motionQueueEntry);
            }
            if (motionQueueEntry._motion._onBeganMotion) {
                motionQueueEntry._motion._onBeganMotion(motionQueueEntry._motion);
            }
        }
        updateFadeWeight(motionQueueEntry, userTimeSeconds) {
            if (motionQueueEntry == null) {
                cubismdebug_13.CubismDebug.print(live2dcubismframework_8.LogLevel.LogLevel_Error, 'motionQueueEntry is null.');
            }
            let fadeWeight = this._weight;
            const fadeIn = this._fadeInSeconds == 0.0
                ? 1.0
                : cubismmath_5.CubismMath.getEasingSine((userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                    this._fadeInSeconds);
            const fadeOut = this._fadeOutSeconds == 0.0 || motionQueueEntry.getEndTime() < 0.0
                ? 1.0
                : cubismmath_5.CubismMath.getEasingSine((motionQueueEntry.getEndTime() - userTimeSeconds) /
                    this._fadeOutSeconds);
            fadeWeight = fadeWeight * fadeIn * fadeOut;
            motionQueueEntry.setState(userTimeSeconds, fadeWeight);
            (0, cubismdebug_13.CSM_ASSERT)(0.0 <= fadeWeight && fadeWeight <= 1.0);
            return fadeWeight;
        }
        setFadeInTime(fadeInSeconds) {
            this._fadeInSeconds = fadeInSeconds;
        }
        setFadeOutTime(fadeOutSeconds) {
            this._fadeOutSeconds = fadeOutSeconds;
        }
        getFadeOutTime() {
            return this._fadeOutSeconds;
        }
        getFadeInTime() {
            return this._fadeInSeconds;
        }
        setWeight(weight) {
            this._weight = weight;
        }
        getWeight() {
            return this._weight;
        }
        getDuration() {
            return -1.0;
        }
        getLoopDuration() {
            return -1.0;
        }
        setOffsetTime(offsetSeconds) {
            this._offsetSeconds = offsetSeconds;
        }
        setLoop(loop) {
            this._isLoop = loop;
        }
        getLoop() {
            return this._isLoop;
        }
        setLoopFadeIn(loopFadeIn) {
            this._isLoopFadeIn = loopFadeIn;
        }
        getLoopFadeIn() {
            return this._isLoopFadeIn;
        }
        getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
            return this._firedEventValues;
        }
        isExistModelOpacity() {
            return false;
        }
        getModelOpacityIndex() {
            return -1;
        }
        getModelOpacityId(index) {
            return null;
        }
        getModelOpacityValue() {
            return 1.0;
        }
        adjustEndTime(motionQueueEntry) {
            const duration = this.getDuration();
            const endTime = duration <= 0.0 ? -1 : motionQueueEntry.getStartTime() + duration;
            motionQueueEntry.setEndTime(endTime);
        }
    }
    exports.ACubismMotion = ACubismMotion;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.ACubismMotion = $.ACubismMotion;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismexpressionmotionmanager", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/motion/cubismexpressionmotion", "framework/src/motion/cubismmotionqueuemanager", "framework/src/motion/cubismexpressionmotionmanager", "framework/src/math/cubismmath"], function (require, exports, live2dcubismframework_9, cubismexpressionmotion_1, cubismmotionqueuemanager_1, $, cubismmath_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismExpressionMotionManager = exports.ExpressionParameterValue = void 0;
    class ExpressionParameterValue {
    }
    exports.ExpressionParameterValue = ExpressionParameterValue;
    class CubismExpressionMotionManager extends cubismmotionqueuemanager_1.CubismMotionQueueManager {
        constructor() {
            super();
            this._expressionParameterValues = new Array();
            this._fadeWeights = new Array();
        }
        release() {
            if (this._expressionParameterValues) {
                (0, live2dcubismframework_9.csmDelete)(this._expressionParameterValues);
                this._expressionParameterValues = null;
            }
            if (this._fadeWeights) {
                (0, live2dcubismframework_9.csmDelete)(this._fadeWeights);
                this._fadeWeights = null;
            }
        }
        getFadeWeight(index) {
            if (index < 0 ||
                this._fadeWeights.length < 1 ||
                index >= this._fadeWeights.length) {
                console.warn('Failed to get the fade weight value. The element at that index does not exist.');
                return -1;
            }
            return this._fadeWeights[index];
        }
        setFadeWeight(index, expressionFadeWeight) {
            if (index < 0 ||
                this._fadeWeights.length < 1 ||
                this._fadeWeights.length <= index) {
                console.warn('Failed to set the fade weight value. The element at that index does not exist.');
                return;
            }
            this._fadeWeights[index] = expressionFadeWeight;
        }
        updateMotion(model, deltaTimeSeconds) {
            this._userTimeSeconds += deltaTimeSeconds;
            let updated = false;
            const motions = this.getCubismMotionQueueEntries();
            let expressionWeight = 0.0;
            let expressionIndex = 0;
            if (this._fadeWeights.length !== motions.length) {
                const difference = motions.length - this._fadeWeights.length;
                let dstIndex = this._fadeWeights.length;
                this._fadeWeights.length += difference;
                for (let i = 0; i < difference; i++) {
                    this._fadeWeights[dstIndex++] = 0.0;
                }
            }
            for (let i = 0; i < this._motions.length;) {
                const motionQueueEntry = this._motions[i];
                if (motionQueueEntry == null) {
                    motions.splice(i, 1);
                    continue;
                }
                const expressionMotion = (motionQueueEntry.getCubismMotion());
                if (expressionMotion == null) {
                    (0, live2dcubismframework_9.csmDelete)(motionQueueEntry);
                    motions.splice(i, 1);
                    continue;
                }
                const expressionParameters = expressionMotion.getExpressionParameters();
                if (motionQueueEntry.isAvailable()) {
                    for (let i = 0; i < expressionParameters.length; ++i) {
                        if (expressionParameters[i].parameterId == null) {
                            continue;
                        }
                        let index = -1;
                        for (let j = 0; j < this._expressionParameterValues.length; ++j) {
                            if (this._expressionParameterValues[j].parameterId !=
                                expressionParameters[i].parameterId) {
                                continue;
                            }
                            index = j;
                            break;
                        }
                        if (index >= 0) {
                            continue;
                        }
                        const item = new ExpressionParameterValue();
                        item.parameterId = expressionParameters[i].parameterId;
                        item.additiveValue = cubismexpressionmotion_1.CubismExpressionMotion.DefaultAdditiveValue;
                        item.multiplyValue = cubismexpressionmotion_1.CubismExpressionMotion.DefaultMultiplyValue;
                        item.overwriteValue = model.getParameterValueById(item.parameterId);
                        this._expressionParameterValues.push(item);
                    }
                }
                expressionMotion.setupMotionQueueEntry(motionQueueEntry, this._userTimeSeconds);
                this.setFadeWeight(expressionIndex, expressionMotion.updateFadeWeight(motionQueueEntry, this._userTimeSeconds));
                expressionMotion.calculateExpressionParameters(model, this._userTimeSeconds, motionQueueEntry, this._expressionParameterValues, expressionIndex, this.getFadeWeight(expressionIndex));
                expressionWeight +=
                    expressionMotion.getFadeInTime() == 0.0
                        ? 1.0
                        : cubismmath_6.CubismMath.getEasingSine((this._userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                            expressionMotion.getFadeInTime());
                updated = true;
                if (motionQueueEntry.isTriggeredFadeOut()) {
                    motionQueueEntry.startFadeOut(motionQueueEntry.getFadeOutSeconds(), this._userTimeSeconds);
                }
                ++i;
                ++expressionIndex;
            }
            if (motions.length > 1) {
                const latestFadeWeight = this.getFadeWeight(this._fadeWeights.length - 1);
                if (latestFadeWeight >= 1.0) {
                    for (let i = motions.length - 2; i >= 0; --i) {
                        const motionQueueEntry = motions[i];
                        (0, live2dcubismframework_9.csmDelete)(motionQueueEntry);
                        motions.splice(i, 1);
                        this._fadeWeights.splice(i, 1);
                    }
                }
            }
            if (expressionWeight > 1.0) {
                expressionWeight = 1.0;
            }
            for (let i = 0; i < this._expressionParameterValues.length; ++i) {
                const expressionParameterValue = this._expressionParameterValues[i];
                model.setParameterValueById(expressionParameterValue.parameterId, (expressionParameterValue.overwriteValue +
                    expressionParameterValue.additiveValue) *
                    expressionParameterValue.multiplyValue, expressionWeight);
                expressionParameterValue.additiveValue =
                    cubismexpressionmotion_1.CubismExpressionMotion.DefaultAdditiveValue;
                expressionParameterValue.multiplyValue =
                    cubismexpressionmotion_1.CubismExpressionMotion.DefaultMultiplyValue;
            }
            return updated;
        }
    }
    exports.CubismExpressionMotionManager = CubismExpressionMotionManager;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismExpressionMotionManager = $.CubismExpressionMotionManager;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismexpressionmotion", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/utils/cubismjson", "framework/src/motion/acubismmotion", "framework/src/motion/cubismexpressionmotion"], function (require, exports, live2dcubismframework_10, cubismjson_5, acubismmotion_2, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.ExpressionParameter = exports.ExpressionBlendType = exports.CubismExpressionMotion = void 0;
    const ExpressionKeyFadeIn = 'FadeInTime';
    const ExpressionKeyFadeOut = 'FadeOutTime';
    const ExpressionKeyParameters = 'Parameters';
    const ExpressionKeyId = 'Id';
    const ExpressionKeyValue = 'Value';
    const ExpressionKeyBlend = 'Blend';
    const BlendValueAdd = 'Add';
    const BlendValueMultiply = 'Multiply';
    const BlendValueOverwrite = 'Overwrite';
    const DefaultFadeTime = 1.0;
    class CubismExpressionMotion extends acubismmotion_2.ACubismMotion {
        static create(buffer, size) {
            const expression = new CubismExpressionMotion();
            expression.parse(buffer, size);
            return expression;
        }
        doUpdateParameters(model, userTimeSeconds, weight, motionQueueEntry) {
            for (let i = 0; i < this._parameters.length; ++i) {
                const parameter = this._parameters[i];
                switch (parameter.blendType) {
                    case ExpressionBlendType.Additive: {
                        model.addParameterValueById(parameter.parameterId, parameter.value, weight);
                        break;
                    }
                    case ExpressionBlendType.Multiply: {
                        model.multiplyParameterValueById(parameter.parameterId, parameter.value, weight);
                        break;
                    }
                    case ExpressionBlendType.Overwrite: {
                        model.setParameterValueById(parameter.parameterId, parameter.value, weight);
                        break;
                    }
                    default:
                        break;
                }
            }
        }
        calculateExpressionParameters(model, userTimeSeconds, motionQueueEntry, expressionParameterValues, expressionIndex, fadeWeight) {
            if (motionQueueEntry == null || expressionParameterValues == null) {
                return;
            }
            if (!motionQueueEntry.isAvailable()) {
                return;
            }
            for (let i = 0; i < expressionParameterValues.length; ++i) {
                const expressionParameterValue = expressionParameterValues[i];
                if (expressionParameterValue.parameterId == null) {
                    continue;
                }
                const currentParameterValue = (expressionParameterValue.overwriteValue =
                    model.getParameterValueById(expressionParameterValue.parameterId));
                const expressionParameters = this.getExpressionParameters();
                let parameterIndex = -1;
                for (let j = 0; j < expressionParameters.length; ++j) {
                    if (expressionParameterValue.parameterId !=
                        expressionParameters[j].parameterId) {
                        continue;
                    }
                    parameterIndex = j;
                    break;
                }
                if (parameterIndex < 0) {
                    if (expressionIndex == 0) {
                        expressionParameterValue.additiveValue =
                            CubismExpressionMotion.DefaultAdditiveValue;
                        expressionParameterValue.multiplyValue =
                            CubismExpressionMotion.DefaultMultiplyValue;
                        expressionParameterValue.overwriteValue = currentParameterValue;
                    }
                    else {
                        expressionParameterValue.additiveValue = this.calculateValue(expressionParameterValue.additiveValue, CubismExpressionMotion.DefaultAdditiveValue, fadeWeight);
                        expressionParameterValue.multiplyValue = this.calculateValue(expressionParameterValue.multiplyValue, CubismExpressionMotion.DefaultMultiplyValue, fadeWeight);
                        expressionParameterValue.overwriteValue = this.calculateValue(expressionParameterValue.overwriteValue, currentParameterValue, fadeWeight);
                    }
                    continue;
                }
                const value = expressionParameters[parameterIndex].value;
                let newAdditiveValue, newMultiplyValue, newOverwriteValue;
                switch (expressionParameters[parameterIndex].blendType) {
                    case ExpressionBlendType.Additive:
                        newAdditiveValue = value;
                        newMultiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
                        newOverwriteValue = currentParameterValue;
                        break;
                    case ExpressionBlendType.Multiply:
                        newAdditiveValue = CubismExpressionMotion.DefaultAdditiveValue;
                        newMultiplyValue = value;
                        newOverwriteValue = currentParameterValue;
                        break;
                    case ExpressionBlendType.Overwrite:
                        newAdditiveValue = CubismExpressionMotion.DefaultAdditiveValue;
                        newMultiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
                        newOverwriteValue = value;
                        break;
                    default:
                        return;
                }
                if (expressionIndex == 0) {
                    expressionParameterValue.additiveValue = newAdditiveValue;
                    expressionParameterValue.multiplyValue = newMultiplyValue;
                    expressionParameterValue.overwriteValue = newOverwriteValue;
                }
                else {
                    expressionParameterValue.additiveValue =
                        expressionParameterValue.additiveValue * (1.0 - fadeWeight) +
                            newAdditiveValue * fadeWeight;
                    expressionParameterValue.multiplyValue =
                        expressionParameterValue.multiplyValue * (1.0 - fadeWeight) +
                            newMultiplyValue * fadeWeight;
                    expressionParameterValue.overwriteValue =
                        expressionParameterValue.overwriteValue * (1.0 - fadeWeight) +
                            newOverwriteValue * fadeWeight;
                }
            }
        }
        getExpressionParameters() {
            return this._parameters;
        }
        parse(buffer, size) {
            const json = cubismjson_5.CubismJson.create(buffer, size);
            if (!json) {
                return;
            }
            const root = json.getRoot();
            this.setFadeInTime(root.getValueByString(ExpressionKeyFadeIn).toFloat(DefaultFadeTime));
            this.setFadeOutTime(root.getValueByString(ExpressionKeyFadeOut).toFloat(DefaultFadeTime));
            const parameterCount = root
                .getValueByString(ExpressionKeyParameters)
                .getSize();
            let dstIndex = this._parameters.length;
            this._parameters.length += parameterCount;
            for (let i = 0; i < parameterCount; ++i) {
                const param = root
                    .getValueByString(ExpressionKeyParameters)
                    .getValueByIndex(i);
                const parameterId = live2dcubismframework_10.CubismFramework.getIdManager().getId(param.getValueByString(ExpressionKeyId).getRawString());
                const value = param
                    .getValueByString(ExpressionKeyValue)
                    .toFloat();
                let blendType;
                if (param.getValueByString(ExpressionKeyBlend).isNull() ||
                    param.getValueByString(ExpressionKeyBlend).getString() == BlendValueAdd) {
                    blendType = ExpressionBlendType.Additive;
                }
                else if (param.getValueByString(ExpressionKeyBlend).getString() ==
                    BlendValueMultiply) {
                    blendType = ExpressionBlendType.Multiply;
                }
                else if (param.getValueByString(ExpressionKeyBlend).getString() ==
                    BlendValueOverwrite) {
                    blendType = ExpressionBlendType.Overwrite;
                }
                else {
                    blendType = ExpressionBlendType.Additive;
                }
                const item = new ExpressionParameter();
                item.parameterId = parameterId;
                item.blendType = blendType;
                item.value = value;
                this._parameters[dstIndex++] = item;
            }
            cubismjson_5.CubismJson.delete(json);
        }
        calculateValue(source, destination, fadeWeight) {
            return source * (1.0 - fadeWeight) + destination * fadeWeight;
        }
        constructor() {
            super();
            this._parameters = new Array();
        }
    }
    exports.CubismExpressionMotion = CubismExpressionMotion;
    CubismExpressionMotion.DefaultAdditiveValue = 0.0;
    CubismExpressionMotion.DefaultMultiplyValue = 1.0;
    var ExpressionBlendType;
    (function (ExpressionBlendType) {
        ExpressionBlendType[ExpressionBlendType["Additive"] = 0] = "Additive";
        ExpressionBlendType[ExpressionBlendType["Multiply"] = 1] = "Multiply";
        ExpressionBlendType[ExpressionBlendType["Overwrite"] = 2] = "Overwrite";
    })(ExpressionBlendType || (exports.ExpressionBlendType = ExpressionBlendType = {}));
    class ExpressionParameter {
    }
    exports.ExpressionParameter = ExpressionParameter;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismExpressionMotion = $.CubismExpressionMotion;
        Live2DCubismFramework.ExpressionBlendType = $.ExpressionBlendType;
        Live2DCubismFramework.ExpressionParameter = $.ExpressionParameter;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismmotioninternal", ["require", "exports", "framework/src/motion/cubismmotioninternal"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMotionData = exports.CubismMotionEvent = exports.CubismMotionCurve = exports.CubismMotionSegment = exports.CubismMotionPoint = exports.CubismMotionSegmentType = exports.CubismMotionCurveTarget = void 0;
    var CubismMotionCurveTarget;
    (function (CubismMotionCurveTarget) {
        CubismMotionCurveTarget[CubismMotionCurveTarget["CubismMotionCurveTarget_Model"] = 0] = "CubismMotionCurveTarget_Model";
        CubismMotionCurveTarget[CubismMotionCurveTarget["CubismMotionCurveTarget_Parameter"] = 1] = "CubismMotionCurveTarget_Parameter";
        CubismMotionCurveTarget[CubismMotionCurveTarget["CubismMotionCurveTarget_PartOpacity"] = 2] = "CubismMotionCurveTarget_PartOpacity";
    })(CubismMotionCurveTarget || (exports.CubismMotionCurveTarget = CubismMotionCurveTarget = {}));
    var CubismMotionSegmentType;
    (function (CubismMotionSegmentType) {
        CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_Linear"] = 0] = "CubismMotionSegmentType_Linear";
        CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_Bezier"] = 1] = "CubismMotionSegmentType_Bezier";
        CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_Stepped"] = 2] = "CubismMotionSegmentType_Stepped";
        CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_InverseStepped"] = 3] = "CubismMotionSegmentType_InverseStepped";
    })(CubismMotionSegmentType || (exports.CubismMotionSegmentType = CubismMotionSegmentType = {}));
    class CubismMotionPoint {
        constructor() {
            this.time = 0.0;
            this.value = 0.0;
        }
    }
    exports.CubismMotionPoint = CubismMotionPoint;
    class CubismMotionSegment {
        constructor() {
            this.evaluate = null;
            this.basePointIndex = 0;
            this.segmentType = 0;
        }
    }
    exports.CubismMotionSegment = CubismMotionSegment;
    class CubismMotionCurve {
        constructor() {
            this.type = CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
            this.segmentCount = 0;
            this.baseSegmentIndex = 0;
            this.fadeInTime = 0.0;
            this.fadeOutTime = 0.0;
        }
    }
    exports.CubismMotionCurve = CubismMotionCurve;
    class CubismMotionEvent {
        constructor() {
            this.fireTime = 0.0;
        }
    }
    exports.CubismMotionEvent = CubismMotionEvent;
    class CubismMotionData {
        constructor() {
            this.duration = 0.0;
            this.loop = false;
            this.curveCount = 0;
            this.eventCount = 0;
            this.fps = 0.0;
            this.curves = new Array();
            this.segments = new Array();
            this.points = new Array();
            this.events = new Array();
        }
    }
    exports.CubismMotionData = CubismMotionData;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMotionCurve = $.CubismMotionCurve;
        Live2DCubismFramework.CubismMotionCurveTarget = $.CubismMotionCurveTarget;
        Live2DCubismFramework.CubismMotionData = $.CubismMotionData;
        Live2DCubismFramework.CubismMotionEvent = $.CubismMotionEvent;
        Live2DCubismFramework.CubismMotionPoint = $.CubismMotionPoint;
        Live2DCubismFramework.CubismMotionSegment = $.CubismMotionSegment;
        Live2DCubismFramework.CubismMotionSegmentType = $.CubismMotionSegmentType;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismmotionjson", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/utils/cubismdebug", "framework/src/utils/cubismjson", "framework/src/motion/cubismmotioninternal", "framework/src/motion/cubismmotionjson"], function (require, exports, live2dcubismframework_11, cubismdebug_14, cubismjson_6, cubismmotioninternal_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.EvaluationOptionFlag = exports.CubismMotionJson = void 0;
    const Meta = 'Meta';
    const Duration = 'Duration';
    const Loop = 'Loop';
    const AreBeziersRestricted = 'AreBeziersRestricted';
    const CurveCount = 'CurveCount';
    const Fps = 'Fps';
    const TotalSegmentCount = 'TotalSegmentCount';
    const TotalPointCount = 'TotalPointCount';
    const Curves = 'Curves';
    const Target = 'Target';
    const Id = 'Id';
    const FadeInTime = 'FadeInTime';
    const FadeOutTime = 'FadeOutTime';
    const Segments = 'Segments';
    const UserData = 'UserData';
    const UserDataCount = 'UserDataCount';
    const TotalUserDataSize = 'TotalUserDataSize';
    const Time = 'Time';
    const Value = 'Value';
    class CubismMotionJson {
        constructor(buffer, size) {
            this._json = cubismjson_6.CubismJson.create(buffer, size);
        }
        release() {
            cubismjson_6.CubismJson.delete(this._json);
        }
        getMotionDuration() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(Duration)
                .toFloat();
        }
        isMotionLoop() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(Loop)
                .toBoolean();
        }
        hasConsistency() {
            let result = true;
            if (!this._json || !this._json.getRoot()) {
                return false;
            }
            const actualCurveListSize = this._json
                .getRoot()
                .getValueByString(Curves)
                .getVector().length;
            let actualTotalSegmentCount = 0;
            let actualTotalPointCount = 0;
            for (let curvePosition = 0; curvePosition < actualCurveListSize; ++curvePosition) {
                for (let segmentPosition = 0; segmentPosition < this.getMotionCurveSegmentCount(curvePosition);) {
                    if (segmentPosition == 0) {
                        actualTotalPointCount += 1;
                        segmentPosition += 2;
                    }
                    const segment = this.getMotionCurveSegment(curvePosition, segmentPosition);
                    switch (segment) {
                        case cubismmotioninternal_1.CubismMotionSegmentType.CubismMotionSegmentType_Linear:
                            actualTotalPointCount += 1;
                            segmentPosition += 3;
                            break;
                        case cubismmotioninternal_1.CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
                            actualTotalPointCount += 3;
                            segmentPosition += 7;
                            break;
                        case cubismmotioninternal_1.CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
                            actualTotalPointCount += 1;
                            segmentPosition += 3;
                            break;
                        case cubismmotioninternal_1.CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
                            actualTotalPointCount += 1;
                            segmentPosition += 3;
                            break;
                        default:
                            (0, cubismdebug_14.CSM_ASSERT)(0);
                            break;
                    }
                    ++actualTotalSegmentCount;
                }
            }
            if (actualCurveListSize != this.getMotionCurveCount()) {
                (0, cubismdebug_14.CubismLogWarning)('The number of curves does not match the metadata.');
                result = false;
            }
            if (actualTotalSegmentCount != this.getMotionTotalSegmentCount()) {
                (0, cubismdebug_14.CubismLogWarning)('The number of segment does not match the metadata.');
                result = false;
            }
            if (actualTotalPointCount != this.getMotionTotalPointCount()) {
                (0, cubismdebug_14.CubismLogWarning)('The number of point does not match the metadata.');
                result = false;
            }
            return result;
        }
        getEvaluationOptionFlag(flagType) {
            if (EvaluationOptionFlag.EvaluationOptionFlag_AreBeziersRistricted == flagType) {
                return this._json
                    .getRoot()
                    .getValueByString(Meta)
                    .getValueByString(AreBeziersRestricted)
                    .toBoolean();
            }
            return false;
        }
        getMotionCurveCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(CurveCount)
                .toInt();
        }
        getMotionFps() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(Fps)
                .toFloat();
        }
        getMotionTotalSegmentCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(TotalSegmentCount)
                .toInt();
        }
        getMotionTotalPointCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(TotalPointCount)
                .toInt();
        }
        isExistMotionFadeInTime() {
            return !this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(FadeInTime)
                .isNull();
        }
        isExistMotionFadeOutTime() {
            return !this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(FadeOutTime)
                .isNull();
        }
        getMotionFadeInTime() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(FadeInTime)
                .toFloat();
        }
        getMotionFadeOutTime() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(FadeOutTime)
                .toFloat();
        }
        getMotionCurveTarget(curveIndex) {
            return this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(Target)
                .getRawString();
        }
        getMotionCurveId(curveIndex) {
            return live2dcubismframework_11.CubismFramework.getIdManager().getId(this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(Id)
                .getRawString());
        }
        isExistMotionCurveFadeInTime(curveIndex) {
            return !this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(FadeInTime)
                .isNull();
        }
        isExistMotionCurveFadeOutTime(curveIndex) {
            return !this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(FadeOutTime)
                .isNull();
        }
        getMotionCurveFadeInTime(curveIndex) {
            return this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(FadeInTime)
                .toFloat();
        }
        getMotionCurveFadeOutTime(curveIndex) {
            return this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(FadeOutTime)
                .toFloat();
        }
        getMotionCurveSegmentCount(curveIndex) {
            return this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(Segments)
                .getVector().length;
        }
        getMotionCurveSegment(curveIndex, segmentIndex) {
            return this._json
                .getRoot()
                .getValueByString(Curves)
                .getValueByIndex(curveIndex)
                .getValueByString(Segments)
                .getValueByIndex(segmentIndex)
                .toFloat();
        }
        getEventCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(UserDataCount)
                .toInt();
        }
        getTotalEventValueSize() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(TotalUserDataSize)
                .toInt();
        }
        getEventTime(userDataIndex) {
            return this._json
                .getRoot()
                .getValueByString(UserData)
                .getValueByIndex(userDataIndex)
                .getValueByString(Time)
                .toFloat();
        }
        getEventValue(userDataIndex) {
            return this._json
                .getRoot()
                .getValueByString(UserData)
                .getValueByIndex(userDataIndex)
                .getValueByString(Value)
                .getRawString();
        }
    }
    exports.CubismMotionJson = CubismMotionJson;
    var EvaluationOptionFlag;
    (function (EvaluationOptionFlag) {
        EvaluationOptionFlag[EvaluationOptionFlag["EvaluationOptionFlag_AreBeziersRistricted"] = 0] = "EvaluationOptionFlag_AreBeziersRistricted";
    })(EvaluationOptionFlag || (exports.EvaluationOptionFlag = EvaluationOptionFlag = {}));
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMotionJson = $.CubismMotionJson;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismmotion", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/math/cubismmath", "framework/src/utils/cubismarrayutils", "framework/src/utils/cubismdebug", "framework/src/motion/acubismmotion", "framework/src/motion/cubismmotioninternal", "framework/src/motion/cubismmotionjson", "framework/src/motion/cubismmotion"], function (require, exports, live2dcubismframework_12, cubismmath_7, cubismarrayutils_3, cubismdebug_15, acubismmotion_3, cubismmotioninternal_2, cubismmotionjson_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMotion = exports.MotionBehavior = void 0;
    const EffectNameEyeBlink = 'EyeBlink';
    const EffectNameLipSync = 'LipSync';
    const TargetNameModel = 'Model';
    const TargetNameParameter = 'Parameter';
    const TargetNamePartOpacity = 'PartOpacity';
    const IdNameOpacity = 'Opacity';
    const UseOldBeziersCurveMotion = false;
    function lerpPoints(a, b, t) {
        const result = new cubismmotioninternal_2.CubismMotionPoint();
        result.time = a.time + (b.time - a.time) * t;
        result.value = a.value + (b.value - a.value) * t;
        return result;
    }
    function linearEvaluate(points, time) {
        let t = (time - points[0].time) / (points[1].time - points[0].time);
        if (t < 0.0) {
            t = 0.0;
        }
        return points[0].value + (points[1].value - points[0].value) * t;
    }
    function bezierEvaluate(points, time) {
        let t = (time - points[0].time) / (points[3].time - points[0].time);
        if (t < 0.0) {
            t = 0.0;
        }
        const p01 = lerpPoints(points[0], points[1], t);
        const p12 = lerpPoints(points[1], points[2], t);
        const p23 = lerpPoints(points[2], points[3], t);
        const p012 = lerpPoints(p01, p12, t);
        const p123 = lerpPoints(p12, p23, t);
        return lerpPoints(p012, p123, t).value;
    }
    function bezierEvaluateBinarySearch(points, time) {
        const xError = 0.01;
        const x = time;
        let x1 = points[0].time;
        let x2 = points[3].time;
        let cx1 = points[1].time;
        let cx2 = points[2].time;
        let ta = 0.0;
        let tb = 1.0;
        let t = 0.0;
        let i = 0;
        for (let var33 = true; i < 20; ++i) {
            if (x < x1 + xError) {
                t = ta;
                break;
            }
            if (x2 - xError < x) {
                t = tb;
                break;
            }
            let centerx = (cx1 + cx2) * 0.5;
            cx1 = (x1 + cx1) * 0.5;
            cx2 = (x2 + cx2) * 0.5;
            const ctrlx12 = (cx1 + centerx) * 0.5;
            const ctrlx21 = (cx2 + centerx) * 0.5;
            centerx = (ctrlx12 + ctrlx21) * 0.5;
            if (x < centerx) {
                tb = (ta + tb) * 0.5;
                if (centerx - xError < x) {
                    t = tb;
                    break;
                }
                x2 = centerx;
                cx2 = ctrlx12;
            }
            else {
                ta = (ta + tb) * 0.5;
                if (x < centerx + xError) {
                    t = ta;
                    break;
                }
                x1 = centerx;
                cx1 = ctrlx21;
            }
        }
        if (i == 20) {
            t = (ta + tb) * 0.5;
        }
        if (t < 0.0) {
            t = 0.0;
        }
        if (t > 1.0) {
            t = 1.0;
        }
        const p01 = lerpPoints(points[0], points[1], t);
        const p12 = lerpPoints(points[1], points[2], t);
        const p23 = lerpPoints(points[2], points[3], t);
        const p012 = lerpPoints(p01, p12, t);
        const p123 = lerpPoints(p12, p23, t);
        return lerpPoints(p012, p123, t).value;
    }
    function bezierEvaluateCardanoInterpretation(points, time) {
        const x = time;
        const x1 = points[0].time;
        const x2 = points[3].time;
        const cx1 = points[1].time;
        const cx2 = points[2].time;
        const a = x2 - 3.0 * cx2 + 3.0 * cx1 - x1;
        const b = 3.0 * cx2 - 6.0 * cx1 + 3.0 * x1;
        const c = 3.0 * cx1 - 3.0 * x1;
        const d = x1 - x;
        const t = cubismmath_7.CubismMath.cardanoAlgorithmForBezier(a, b, c, d);
        const p01 = lerpPoints(points[0], points[1], t);
        const p12 = lerpPoints(points[1], points[2], t);
        const p23 = lerpPoints(points[2], points[3], t);
        const p012 = lerpPoints(p01, p12, t);
        const p123 = lerpPoints(p12, p23, t);
        return lerpPoints(p012, p123, t).value;
    }
    function steppedEvaluate(points, time) {
        return points[0].value;
    }
    function inverseSteppedEvaluate(points, time) {
        return points[1].value;
    }
    function evaluateCurve(motionData, index, time, isCorrection, endTime) {
        const curve = motionData.curves[index];
        let target = -1;
        const totalSegmentCount = curve.baseSegmentIndex + curve.segmentCount;
        let pointPosition = 0;
        for (let i = curve.baseSegmentIndex; i < totalSegmentCount; ++i) {
            pointPosition =
                motionData.segments[i].basePointIndex +
                    (motionData.segments[i].segmentType ==
                        cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Bezier
                        ? 3
                        : 1);
            if (motionData.points[pointPosition].time > time) {
                target = i;
                break;
            }
        }
        if (target == -1) {
            if (isCorrection && time < endTime) {
                return correctEndPoint(motionData, totalSegmentCount - 1, motionData.segments[curve.baseSegmentIndex].basePointIndex, pointPosition, time, endTime);
            }
            return motionData.points[pointPosition].value;
        }
        const segment = motionData.segments[target];
        return segment.evaluate(motionData.points.slice(segment.basePointIndex), time);
    }
    function correctEndPoint(motionData, segmentIndex, beginIndex, endIndex, time, endTime) {
        const motionPoint = [
            new cubismmotioninternal_2.CubismMotionPoint(),
            new cubismmotioninternal_2.CubismMotionPoint()
        ];
        {
            const src = motionData.points[endIndex];
            motionPoint[0].time = src.time;
            motionPoint[0].value = src.value;
        }
        {
            const src = motionData.points[beginIndex];
            motionPoint[1].time = endTime;
            motionPoint[1].value = src.value;
        }
        switch (motionData.segments[segmentIndex].segmentType) {
            case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Linear:
            case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
            default:
                return linearEvaluate(motionPoint, time);
            case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
                return steppedEvaluate(motionPoint, time);
            case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
                return inverseSteppedEvaluate(motionPoint, time);
        }
    }
    var MotionBehavior;
    (function (MotionBehavior) {
        MotionBehavior[MotionBehavior["MotionBehavior_V1"] = 0] = "MotionBehavior_V1";
        MotionBehavior[MotionBehavior["MotionBehavior_V2"] = 1] = "MotionBehavior_V2";
    })(MotionBehavior || (exports.MotionBehavior = MotionBehavior = {}));
    class CubismMotion extends acubismmotion_3.ACubismMotion {
        static create(buffer, size, onFinishedMotionHandler, onBeganMotionHandler, shouldCheckMotionConsistency = false) {
            const ret = new CubismMotion();
            ret.parse(buffer, size, shouldCheckMotionConsistency);
            if (ret._motionData) {
                ret._sourceFrameRate = ret._motionData.fps;
                ret._loopDurationSeconds = ret._motionData.duration;
                ret._onFinishedMotion = onFinishedMotionHandler;
                ret._onBeganMotion = onBeganMotionHandler;
            }
            else {
                (0, live2dcubismframework_12.csmDelete)(ret);
                return null;
            }
            return ret;
        }
        doUpdateParameters(model, userTimeSeconds, fadeWeight, motionQueueEntry) {
            if (this._modelCurveIdEyeBlink == null) {
                this._modelCurveIdEyeBlink =
                    live2dcubismframework_12.CubismFramework.getIdManager().getId(EffectNameEyeBlink);
            }
            if (this._modelCurveIdLipSync == null) {
                this._modelCurveIdLipSync =
                    live2dcubismframework_12.CubismFramework.getIdManager().getId(EffectNameLipSync);
            }
            if (this._modelCurveIdOpacity == null) {
                this._modelCurveIdOpacity =
                    live2dcubismframework_12.CubismFramework.getIdManager().getId(IdNameOpacity);
            }
            if (this._motionBehavior === MotionBehavior.MotionBehavior_V2) {
                if (this._previousLoopState !== this._isLoop) {
                    this.adjustEndTime(motionQueueEntry);
                    this._previousLoopState = this._isLoop;
                }
            }
            let timeOffsetSeconds = userTimeSeconds - motionQueueEntry.getStartTime();
            if (timeOffsetSeconds < 0.0) {
                timeOffsetSeconds = 0.0;
            }
            let lipSyncValue = Number.MAX_VALUE;
            let eyeBlinkValue = Number.MAX_VALUE;
            const maxTargetSize = 64;
            let lipSyncFlags = 0;
            let eyeBlinkFlags = 0;
            if (this._eyeBlinkParameterIds.length > maxTargetSize) {
                (0, cubismdebug_15.CubismLogDebug)('too many eye blink targets : {0}', this._eyeBlinkParameterIds.length);
            }
            if (this._lipSyncParameterIds.length > maxTargetSize) {
                (0, cubismdebug_15.CubismLogDebug)('too many lip sync targets : {0}', this._lipSyncParameterIds.length);
            }
            const tmpFadeIn = this._fadeInSeconds <= 0.0
                ? 1.0
                : cubismmath_7.CubismMath.getEasingSine((userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                    this._fadeInSeconds);
            const tmpFadeOut = this._fadeOutSeconds <= 0.0 || motionQueueEntry.getEndTime() < 0.0
                ? 1.0
                : cubismmath_7.CubismMath.getEasingSine((motionQueueEntry.getEndTime() - userTimeSeconds) /
                    this._fadeOutSeconds);
            let value;
            let c, parameterIndex;
            let time = timeOffsetSeconds;
            let duration = this._motionData.duration;
            const isCorrection = this._motionBehavior === MotionBehavior.MotionBehavior_V2 && this._isLoop;
            if (this._isLoop) {
                if (this._motionBehavior === MotionBehavior.MotionBehavior_V2) {
                    duration += 1.0 / this._motionData.fps;
                }
                while (time > duration) {
                    time -= duration;
                }
            }
            const curves = this._motionData.curves;
            for (c = 0; c < this._motionData.curveCount &&
                curves[c].type == cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Model; ++c) {
                value = evaluateCurve(this._motionData, c, time, isCorrection, duration);
                if (curves[c].id == this._modelCurveIdEyeBlink) {
                    eyeBlinkValue = value;
                }
                else if (curves[c].id == this._modelCurveIdLipSync) {
                    lipSyncValue = value;
                }
                else if (curves[c].id == this._modelCurveIdOpacity) {
                    this._modelOpacity = value;
                    model.setModelOapcity(this.getModelOpacityValue());
                }
            }
            let parameterMotionCurveCount = 0;
            for (; c < this._motionData.curveCount &&
                curves[c].type ==
                    cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter; ++c) {
                parameterMotionCurveCount++;
                parameterIndex = model.getParameterIndex(curves[c].id);
                if (parameterIndex == -1) {
                    continue;
                }
                const sourceValue = model.getParameterValueByIndex(parameterIndex);
                value = evaluateCurve(this._motionData, c, time, isCorrection, duration);
                if (eyeBlinkValue != Number.MAX_VALUE) {
                    for (let i = 0; i < this._eyeBlinkParameterIds.length && i < maxTargetSize; ++i) {
                        if (this._eyeBlinkParameterIds[i] == curves[c].id) {
                            value *= eyeBlinkValue;
                            eyeBlinkFlags |= 1 << i;
                            break;
                        }
                    }
                }
                if (lipSyncValue != Number.MAX_VALUE) {
                    for (let i = 0; i < this._lipSyncParameterIds.length && i < maxTargetSize; ++i) {
                        if (this._lipSyncParameterIds[i] == curves[c].id) {
                            value += lipSyncValue;
                            lipSyncFlags |= 1 << i;
                            break;
                        }
                    }
                }
                if (model.isRepeat(parameterIndex)) {
                    value = model.getParameterRepeatValue(parameterIndex, value);
                }
                let v;
                if (curves[c].fadeInTime < 0.0 && curves[c].fadeOutTime < 0.0) {
                    v = sourceValue + (value - sourceValue) * fadeWeight;
                }
                else {
                    let fin;
                    let fout;
                    if (curves[c].fadeInTime < 0.0) {
                        fin = tmpFadeIn;
                    }
                    else {
                        fin =
                            curves[c].fadeInTime == 0.0
                                ? 1.0
                                : cubismmath_7.CubismMath.getEasingSine((userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                                    curves[c].fadeInTime);
                    }
                    if (curves[c].fadeOutTime < 0.0) {
                        fout = tmpFadeOut;
                    }
                    else {
                        fout =
                            curves[c].fadeOutTime == 0.0 || motionQueueEntry.getEndTime() < 0.0
                                ? 1.0
                                : cubismmath_7.CubismMath.getEasingSine((motionQueueEntry.getEndTime() - userTimeSeconds) /
                                    curves[c].fadeOutTime);
                    }
                    const paramWeight = this._weight * fin * fout;
                    v = sourceValue + (value - sourceValue) * paramWeight;
                }
                model.setParameterValueByIndex(parameterIndex, v, 1.0);
            }
            {
                if (eyeBlinkValue != Number.MAX_VALUE) {
                    for (let i = 0; i < this._eyeBlinkParameterIds.length && i < maxTargetSize; ++i) {
                        const sourceValue = model.getParameterValueById(this._eyeBlinkParameterIds[i]);
                        if ((eyeBlinkFlags >> i) & 0x01) {
                            continue;
                        }
                        const v = sourceValue + (eyeBlinkValue - sourceValue) * fadeWeight;
                        model.setParameterValueById(this._eyeBlinkParameterIds[i], v);
                    }
                }
                if (lipSyncValue != Number.MAX_VALUE) {
                    for (let i = 0; i < this._lipSyncParameterIds.length && i < maxTargetSize; ++i) {
                        const sourceValue = model.getParameterValueById(this._lipSyncParameterIds[i]);
                        if ((lipSyncFlags >> i) & 0x01) {
                            continue;
                        }
                        const v = sourceValue + (lipSyncValue - sourceValue) * fadeWeight;
                        model.setParameterValueById(this._lipSyncParameterIds[i], v);
                    }
                }
            }
            for (; c < this._motionData.curveCount &&
                curves[c].type ==
                    cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity; ++c) {
                parameterIndex = model.getParameterIndex(curves[c].id);
                if (parameterIndex == -1) {
                    continue;
                }
                value = evaluateCurve(this._motionData, c, time, isCorrection, duration);
                model.setParameterValueByIndex(parameterIndex, value);
            }
            if (timeOffsetSeconds >= duration) {
                if (this._isLoop) {
                    this.updateForNextLoop(motionQueueEntry, userTimeSeconds, time);
                }
                else {
                    if (this._onFinishedMotion) {
                        this._onFinishedMotion(this);
                    }
                    motionQueueEntry.setIsFinished(true);
                }
            }
            this._lastWeight = fadeWeight;
        }
        setMotionBehavior(motionBehavior) {
            this._motionBehavior = motionBehavior;
        }
        getMotionBehavior() {
            return this._motionBehavior;
        }
        getDuration() {
            return this._isLoop ? -1.0 : this._loopDurationSeconds;
        }
        getLoopDuration() {
            return this._loopDurationSeconds;
        }
        setParameterFadeInTime(parameterId, value) {
            const curves = this._motionData.curves;
            for (let i = 0; i < this._motionData.curveCount; ++i) {
                if (parameterId == curves[i].id) {
                    curves[i].fadeInTime = value;
                    return;
                }
            }
        }
        setParameterFadeOutTime(parameterId, value) {
            const curves = this._motionData.curves;
            for (let i = 0; i < this._motionData.curveCount; ++i) {
                if (parameterId == curves[i].id) {
                    curves[i].fadeOutTime = value;
                    return;
                }
            }
        }
        getParameterFadeInTime(parameterId) {
            const curves = this._motionData.curves;
            for (let i = 0; i < this._motionData.curveCount; ++i) {
                if (parameterId == curves[i].id) {
                    return curves[i].fadeInTime;
                }
            }
            return -1;
        }
        getParameterFadeOutTime(parameterId) {
            const curves = this._motionData.curves;
            for (let i = 0; i < this._motionData.curveCount; ++i) {
                if (parameterId == curves[i].id) {
                    return curves[i].fadeOutTime;
                }
            }
            return -1;
        }
        setEffectIds(eyeBlinkParameterIds, lipSyncParameterIds) {
            this._eyeBlinkParameterIds = eyeBlinkParameterIds;
            this._lipSyncParameterIds = lipSyncParameterIds;
        }
        constructor() {
            super();
            this._motionBehavior = MotionBehavior.MotionBehavior_V2;
            this._sourceFrameRate = 30.0;
            this._loopDurationSeconds = -1.0;
            this._isLoop = false;
            this._isLoopFadeIn = true;
            this._lastWeight = 0.0;
            this._motionData = null;
            this._modelCurveIdEyeBlink = null;
            this._modelCurveIdLipSync = null;
            this._modelCurveIdOpacity = null;
            this._eyeBlinkParameterIds = null;
            this._lipSyncParameterIds = null;
            this._modelOpacity = 1.0;
            this._debugMode = false;
        }
        release() {
            this._motionData = void 0;
            this._motionData = null;
        }
        updateForNextLoop(motionQueueEntry, userTimeSeconds, time) {
            switch (this._motionBehavior) {
                case MotionBehavior.MotionBehavior_V2:
                default:
                    motionQueueEntry.setStartTime(userTimeSeconds - time);
                    if (this._isLoopFadeIn) {
                        motionQueueEntry.setFadeInStartTime(userTimeSeconds - time);
                    }
                    if (this._onFinishedMotion != null) {
                        this._onFinishedMotion(this);
                    }
                    break;
                case MotionBehavior.MotionBehavior_V1:
                    motionQueueEntry.setStartTime(userTimeSeconds);
                    if (this._isLoopFadeIn) {
                        motionQueueEntry.setFadeInStartTime(userTimeSeconds);
                    }
                    break;
            }
        }
        parse(motionJson, size, shouldCheckMotionConsistency = false) {
            let json = new cubismmotionjson_1.CubismMotionJson(motionJson, size);
            if (!json) {
                json.release();
                json = void 0;
                return;
            }
            if (shouldCheckMotionConsistency) {
                const consistency = json.hasConsistency();
                if (!consistency) {
                    json.release();
                    (0, cubismdebug_15.CubismLogError)('Inconsistent motion3.json.');
                    return;
                }
            }
            this._motionData = new cubismmotioninternal_2.CubismMotionData();
            this._motionData.duration = json.getMotionDuration();
            this._motionData.loop = json.isMotionLoop();
            this._motionData.curveCount = json.getMotionCurveCount();
            this._motionData.fps = json.getMotionFps();
            this._motionData.eventCount = json.getEventCount();
            const areBeziersRestructed = json.getEvaluationOptionFlag(cubismmotionjson_1.EvaluationOptionFlag.EvaluationOptionFlag_AreBeziersRistricted);
            if (json.isExistMotionFadeInTime()) {
                this._fadeInSeconds =
                    json.getMotionFadeInTime() < 0.0 ? 1.0 : json.getMotionFadeInTime();
            }
            else {
                this._fadeInSeconds = 1.0;
            }
            if (json.isExistMotionFadeOutTime()) {
                this._fadeOutSeconds =
                    json.getMotionFadeOutTime() < 0.0 ? 1.0 : json.getMotionFadeOutTime();
            }
            else {
                this._fadeOutSeconds = 1.0;
            }
            (0, cubismarrayutils_3.updateSize)(this._motionData.curves, this._motionData.curveCount, cubismmotioninternal_2.CubismMotionCurve, true);
            (0, cubismarrayutils_3.updateSize)(this._motionData.segments, json.getMotionTotalSegmentCount(), cubismmotioninternal_2.CubismMotionSegment, true);
            (0, cubismarrayutils_3.updateSize)(this._motionData.points, json.getMotionTotalPointCount(), cubismmotioninternal_2.CubismMotionPoint, true);
            (0, cubismarrayutils_3.updateSize)(this._motionData.events, this._motionData.eventCount, cubismmotioninternal_2.CubismMotionEvent, true);
            let totalPointCount = 0;
            let totalSegmentCount = 0;
            for (let curveCount = 0; curveCount < this._motionData.curveCount; ++curveCount) {
                if (json.getMotionCurveTarget(curveCount) == TargetNameModel) {
                    this._motionData.curves[curveCount].type =
                        cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
                }
                else if (json.getMotionCurveTarget(curveCount) == TargetNameParameter) {
                    this._motionData.curves[curveCount].type =
                        cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter;
                }
                else if (json.getMotionCurveTarget(curveCount) == TargetNamePartOpacity) {
                    this._motionData.curves[curveCount].type =
                        cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity;
                }
                else {
                    (0, cubismdebug_15.CubismLogWarning)('Warning : Unable to get segment type from Curve! The number of "CurveCount" may be incorrect!');
                }
                this._motionData.curves[curveCount].id =
                    json.getMotionCurveId(curveCount);
                this._motionData.curves[curveCount].baseSegmentIndex = totalSegmentCount;
                this._motionData.curves[curveCount].fadeInTime =
                    json.isExistMotionCurveFadeInTime(curveCount)
                        ? json.getMotionCurveFadeInTime(curveCount)
                        : -1.0;
                this._motionData.curves[curveCount].fadeOutTime =
                    json.isExistMotionCurveFadeOutTime(curveCount)
                        ? json.getMotionCurveFadeOutTime(curveCount)
                        : -1.0;
                for (let segmentPosition = 0; segmentPosition < json.getMotionCurveSegmentCount(curveCount);) {
                    if (segmentPosition == 0) {
                        this._motionData.segments[totalSegmentCount].basePointIndex =
                            totalPointCount;
                        this._motionData.points[totalPointCount].time =
                            json.getMotionCurveSegment(curveCount, segmentPosition);
                        this._motionData.points[totalPointCount].value =
                            json.getMotionCurveSegment(curveCount, segmentPosition + 1);
                        totalPointCount += 1;
                        segmentPosition += 2;
                    }
                    else {
                        this._motionData.segments[totalSegmentCount].basePointIndex =
                            totalPointCount - 1;
                    }
                    const segment = json.getMotionCurveSegment(curveCount, segmentPosition);
                    const segmentType = segment;
                    switch (segmentType) {
                        case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Linear: {
                            this._motionData.segments[totalSegmentCount].segmentType =
                                cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Linear;
                            this._motionData.segments[totalSegmentCount].evaluate =
                                linearEvaluate;
                            this._motionData.points[totalPointCount].time =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 1);
                            this._motionData.points[totalPointCount].value =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 2);
                            totalPointCount += 1;
                            segmentPosition += 3;
                            break;
                        }
                        case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Bezier: {
                            this._motionData.segments[totalSegmentCount].segmentType =
                                cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Bezier;
                            if (areBeziersRestructed || UseOldBeziersCurveMotion) {
                                this._motionData.segments[totalSegmentCount].evaluate =
                                    bezierEvaluate;
                            }
                            else {
                                this._motionData.segments[totalSegmentCount].evaluate =
                                    bezierEvaluateCardanoInterpretation;
                            }
                            this._motionData.points[totalPointCount].time =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 1);
                            this._motionData.points[totalPointCount].value =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 2);
                            this._motionData.points[totalPointCount + 1].time =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 3);
                            this._motionData.points[totalPointCount + 1].value =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 4);
                            this._motionData.points[totalPointCount + 2].time =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 5);
                            this._motionData.points[totalPointCount + 2].value =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 6);
                            totalPointCount += 3;
                            segmentPosition += 7;
                            break;
                        }
                        case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Stepped: {
                            this._motionData.segments[totalSegmentCount].segmentType =
                                cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_Stepped;
                            this._motionData.segments[totalSegmentCount].evaluate =
                                steppedEvaluate;
                            this._motionData.points[totalPointCount].time =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 1);
                            this._motionData.points[totalPointCount].value =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 2);
                            totalPointCount += 1;
                            segmentPosition += 3;
                            break;
                        }
                        case cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped: {
                            this._motionData.segments[totalSegmentCount].segmentType =
                                cubismmotioninternal_2.CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped;
                            this._motionData.segments[totalSegmentCount].evaluate =
                                inverseSteppedEvaluate;
                            this._motionData.points[totalPointCount].time =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 1);
                            this._motionData.points[totalPointCount].value =
                                json.getMotionCurveSegment(curveCount, segmentPosition + 2);
                            totalPointCount += 1;
                            segmentPosition += 3;
                            break;
                        }
                        default: {
                            (0, cubismdebug_15.CSM_ASSERT)(0);
                            break;
                        }
                    }
                    ++this._motionData.curves[curveCount].segmentCount;
                    ++totalSegmentCount;
                }
            }
            for (let userdatacount = 0; userdatacount < json.getEventCount(); ++userdatacount) {
                this._motionData.events[userdatacount].fireTime =
                    json.getEventTime(userdatacount);
                this._motionData.events[userdatacount].value =
                    json.getEventValue(userdatacount);
            }
            json.release();
            json = void 0;
            json = null;
        }
        getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
            (0, cubismarrayutils_3.updateSize)(this._firedEventValues, 0);
            for (let u = 0; u < this._motionData.eventCount; ++u) {
                if (this._motionData.events[u].fireTime > beforeCheckTimeSeconds &&
                    this._motionData.events[u].fireTime <= motionTimeSeconds) {
                    this._firedEventValues.push(this._motionData.events[u].value);
                }
            }
            return this._firedEventValues;
        }
        isExistModelOpacity() {
            for (let i = 0; i < this._motionData.curveCount; i++) {
                const curve = this._motionData.curves[i];
                if (curve.type != cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
                    continue;
                }
                if (curve.id.getString().localeCompare(IdNameOpacity) == 0) {
                    return true;
                }
            }
            return false;
        }
        getModelOpacityIndex() {
            if (this.isExistModelOpacity()) {
                for (let i = 0; i < this._motionData.curveCount; i++) {
                    const curve = this._motionData.curves[i];
                    if (curve.type != cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
                        continue;
                    }
                    if (curve.id.getString().localeCompare(IdNameOpacity) == 0) {
                        return i;
                    }
                }
            }
            return -1;
        }
        getModelOpacityId(index) {
            if (index != -1) {
                const curve = this._motionData.curves[index];
                if (curve.type == cubismmotioninternal_2.CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
                    if (curve.id.getString().localeCompare(IdNameOpacity) == 0) {
                        return live2dcubismframework_12.CubismFramework.getIdManager().getId(curve.id.getString());
                    }
                }
            }
            return null;
        }
        getModelOpacityValue() {
            return this._modelOpacity;
        }
        setDebugMode(debugMode) {
            this._debugMode = debugMode;
        }
    }
    exports.CubismMotion = CubismMotion;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMotion = $.CubismMotion;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismmotionmanager", ["require", "exports", "framework/src/motion/cubismmotionqueuemanager", "framework/src/motion/cubismmotionmanager"], function (require, exports, cubismmotionqueuemanager_2, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismMotionManager = void 0;
    class CubismMotionManager extends cubismmotionqueuemanager_2.CubismMotionQueueManager {
        constructor() {
            super();
            this._currentPriority = 0;
            this._reservePriority = 0;
        }
        getCurrentPriority() {
            return this._currentPriority;
        }
        getReservePriority() {
            return this._reservePriority;
        }
        setReservePriority(val) {
            this._reservePriority = val;
        }
        startMotionPriority(motion, autoDelete, priority) {
            if (priority == this._reservePriority) {
                this._reservePriority = 0;
            }
            this._currentPriority = priority;
            return super.startMotion(motion, autoDelete);
        }
        updateMotion(model, deltaTimeSeconds) {
            this._userTimeSeconds += deltaTimeSeconds;
            const updated = super.doUpdateMotion(model, this._userTimeSeconds);
            if (this.isFinished()) {
                this._currentPriority = 0;
            }
            return updated;
        }
        reserveMotion(priority) {
            if (priority <= this._reservePriority ||
                priority <= this._currentPriority) {
                return false;
            }
            this._reservePriority = priority;
            return true;
        }
    }
    exports.CubismMotionManager = CubismMotionManager;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismMotionManager = $.CubismMotionManager;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/physics/cubismphysicsinternal", ["require", "exports", "framework/src/math/cubismvector2", "framework/src/physics/cubismphysicsinternal"], function (require, exports, cubismvector2_2, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismPhysicsRig = exports.CubismPhysicsOutput = exports.CubismPhysicsInput = exports.CubismPhysicsSubRig = exports.CubismPhysicsParticle = exports.CubismPhysicsNormalization = exports.CubismPhysicsParameter = exports.PhysicsJsonEffectiveForces = exports.CubismPhysicsSource = exports.CubismPhysicsTargetType = void 0;
    var CubismPhysicsTargetType;
    (function (CubismPhysicsTargetType) {
        CubismPhysicsTargetType[CubismPhysicsTargetType["CubismPhysicsTargetType_Parameter"] = 0] = "CubismPhysicsTargetType_Parameter";
    })(CubismPhysicsTargetType || (exports.CubismPhysicsTargetType = CubismPhysicsTargetType = {}));
    var CubismPhysicsSource;
    (function (CubismPhysicsSource) {
        CubismPhysicsSource[CubismPhysicsSource["CubismPhysicsSource_X"] = 0] = "CubismPhysicsSource_X";
        CubismPhysicsSource[CubismPhysicsSource["CubismPhysicsSource_Y"] = 1] = "CubismPhysicsSource_Y";
        CubismPhysicsSource[CubismPhysicsSource["CubismPhysicsSource_Angle"] = 2] = "CubismPhysicsSource_Angle";
    })(CubismPhysicsSource || (exports.CubismPhysicsSource = CubismPhysicsSource = {}));
    class PhysicsJsonEffectiveForces {
        constructor() {
            this.gravity = new cubismvector2_2.CubismVector2(0, 0);
            this.wind = new cubismvector2_2.CubismVector2(0, 0);
        }
    }
    exports.PhysicsJsonEffectiveForces = PhysicsJsonEffectiveForces;
    class CubismPhysicsParameter {
    }
    exports.CubismPhysicsParameter = CubismPhysicsParameter;
    class CubismPhysicsNormalization {
    }
    exports.CubismPhysicsNormalization = CubismPhysicsNormalization;
    class CubismPhysicsParticle {
        constructor() {
            this.initialPosition = new cubismvector2_2.CubismVector2(0, 0);
            this.position = new cubismvector2_2.CubismVector2(0, 0);
            this.lastPosition = new cubismvector2_2.CubismVector2(0, 0);
            this.lastGravity = new cubismvector2_2.CubismVector2(0, 0);
            this.force = new cubismvector2_2.CubismVector2(0, 0);
            this.velocity = new cubismvector2_2.CubismVector2(0, 0);
        }
    }
    exports.CubismPhysicsParticle = CubismPhysicsParticle;
    class CubismPhysicsSubRig {
        constructor() {
            this.normalizationPosition = new CubismPhysicsNormalization();
            this.normalizationAngle = new CubismPhysicsNormalization();
        }
    }
    exports.CubismPhysicsSubRig = CubismPhysicsSubRig;
    class CubismPhysicsInput {
        constructor() {
            this.source = new CubismPhysicsParameter();
        }
    }
    exports.CubismPhysicsInput = CubismPhysicsInput;
    class CubismPhysicsOutput {
        constructor() {
            this.destination = new CubismPhysicsParameter();
            this.translationScale = new cubismvector2_2.CubismVector2(0, 0);
        }
    }
    exports.CubismPhysicsOutput = CubismPhysicsOutput;
    class CubismPhysicsRig {
        constructor() {
            this.settings = new Array();
            this.inputs = new Array();
            this.outputs = new Array();
            this.particles = new Array();
            this.gravity = new cubismvector2_2.CubismVector2(0, 0);
            this.wind = new cubismvector2_2.CubismVector2(0, 0);
            this.fps = 0.0;
        }
    }
    exports.CubismPhysicsRig = CubismPhysicsRig;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismPhysicsInput = $.CubismPhysicsInput;
        Live2DCubismFramework.CubismPhysicsNormalization = $.CubismPhysicsNormalization;
        Live2DCubismFramework.CubismPhysicsOutput = $.CubismPhysicsOutput;
        Live2DCubismFramework.CubismPhysicsParameter = $.CubismPhysicsParameter;
        Live2DCubismFramework.CubismPhysicsParticle = $.CubismPhysicsParticle;
        Live2DCubismFramework.CubismPhysicsRig = $.CubismPhysicsRig;
        Live2DCubismFramework.CubismPhysicsSource = $.CubismPhysicsSource;
        Live2DCubismFramework.CubismPhysicsSubRig = $.CubismPhysicsSubRig;
        Live2DCubismFramework.CubismPhysicsTargetType = $.CubismPhysicsTargetType;
        Live2DCubismFramework.PhysicsJsonEffectiveForces = $.PhysicsJsonEffectiveForces;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/physics/cubismphysicsjson", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/math/cubismvector2", "framework/src/utils/cubismjson", "framework/src/physics/cubismphysicsjson"], function (require, exports, live2dcubismframework_13, cubismvector2_3, cubismjson_7, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismPhysicsJson = void 0;
    const Position = 'Position';
    const X = 'X';
    const Y = 'Y';
    const Angle = 'Angle';
    const Type = 'Type';
    const Id = 'Id';
    const Meta = 'Meta';
    const EffectiveForces = 'EffectiveForces';
    const TotalInputCount = 'TotalInputCount';
    const TotalOutputCount = 'TotalOutputCount';
    const PhysicsSettingCount = 'PhysicsSettingCount';
    const Gravity = 'Gravity';
    const Wind = 'Wind';
    const VertexCount = 'VertexCount';
    const Fps = 'Fps';
    const PhysicsSettings = 'PhysicsSettings';
    const Normalization = 'Normalization';
    const Minimum = 'Minimum';
    const Maximum = 'Maximum';
    const Default = 'Default';
    const Reflect = 'Reflect';
    const Weight = 'Weight';
    const Input = 'Input';
    const Source = 'Source';
    const Output = 'Output';
    const Scale = 'Scale';
    const VertexIndex = 'VertexIndex';
    const Destination = 'Destination';
    const Vertices = 'Vertices';
    const Mobility = 'Mobility';
    const Delay = 'Delay';
    const Radius = 'Radius';
    const Acceleration = 'Acceleration';
    class CubismPhysicsJson {
        constructor(buffer, size) {
            this._json = cubismjson_7.CubismJson.create(buffer, size);
        }
        release() {
            cubismjson_7.CubismJson.delete(this._json);
        }
        getGravity() {
            const ret = new cubismvector2_3.CubismVector2(0, 0);
            ret.x = this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(EffectiveForces)
                .getValueByString(Gravity)
                .getValueByString(X)
                .toFloat();
            ret.y = this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(EffectiveForces)
                .getValueByString(Gravity)
                .getValueByString(Y)
                .toFloat();
            return ret;
        }
        getWind() {
            const ret = new cubismvector2_3.CubismVector2(0, 0);
            ret.x = this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(EffectiveForces)
                .getValueByString(Wind)
                .getValueByString(X)
                .toFloat();
            ret.y = this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(EffectiveForces)
                .getValueByString(Wind)
                .getValueByString(Y)
                .toFloat();
            return ret;
        }
        getFps() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(Fps)
                .toFloat(0.0);
        }
        getSubRigCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(PhysicsSettingCount)
                .toInt();
        }
        getTotalInputCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(TotalInputCount)
                .toInt();
        }
        getTotalOutputCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(TotalOutputCount)
                .toInt();
        }
        getVertexCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(VertexCount)
                .toInt();
        }
        getNormalizationPositionMinimumValue(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Normalization)
                .getValueByString(Position)
                .getValueByString(Minimum)
                .toFloat();
        }
        getNormalizationPositionMaximumValue(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Normalization)
                .getValueByString(Position)
                .getValueByString(Maximum)
                .toFloat();
        }
        getNormalizationPositionDefaultValue(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Normalization)
                .getValueByString(Position)
                .getValueByString(Default)
                .toFloat();
        }
        getNormalizationAngleMinimumValue(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Normalization)
                .getValueByString(Angle)
                .getValueByString(Minimum)
                .toFloat();
        }
        getNormalizationAngleMaximumValue(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Normalization)
                .getValueByString(Angle)
                .getValueByString(Maximum)
                .toFloat();
        }
        getNormalizationAngleDefaultValue(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Normalization)
                .getValueByString(Angle)
                .getValueByString(Default)
                .toFloat();
        }
        getInputCount(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Input)
                .getVector().length;
        }
        getInputWeight(physicsSettingIndex, inputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Input)
                .getValueByIndex(inputIndex)
                .getValueByString(Weight)
                .toFloat();
        }
        getInputReflect(physicsSettingIndex, inputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Input)
                .getValueByIndex(inputIndex)
                .getValueByString(Reflect)
                .toBoolean();
        }
        getInputType(physicsSettingIndex, inputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Input)
                .getValueByIndex(inputIndex)
                .getValueByString(Type)
                .getRawString();
        }
        getInputSourceId(physicsSettingIndex, inputIndex) {
            return live2dcubismframework_13.CubismFramework.getIdManager().getId(this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Input)
                .getValueByIndex(inputIndex)
                .getValueByString(Source)
                .getValueByString(Id)
                .getRawString());
        }
        getOutputCount(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getVector().length;
        }
        getOutputVertexIndex(physicsSettingIndex, outputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getValueByIndex(outputIndex)
                .getValueByString(VertexIndex)
                .toInt();
        }
        getOutputAngleScale(physicsSettingIndex, outputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getValueByIndex(outputIndex)
                .getValueByString(Scale)
                .toFloat();
        }
        getOutputWeight(physicsSettingIndex, outputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getValueByIndex(outputIndex)
                .getValueByString(Weight)
                .toFloat();
        }
        getOutputDestinationId(physicsSettingIndex, outputIndex) {
            return live2dcubismframework_13.CubismFramework.getIdManager().getId(this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getValueByIndex(outputIndex)
                .getValueByString(Destination)
                .getValueByString(Id)
                .getRawString());
        }
        getOutputType(physicsSettingIndex, outputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getValueByIndex(outputIndex)
                .getValueByString(Type)
                .getRawString();
        }
        getOutputReflect(physicsSettingIndex, outputIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Output)
                .getValueByIndex(outputIndex)
                .getValueByString(Reflect)
                .toBoolean();
        }
        getParticleCount(physicsSettingIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getVector().length;
        }
        getParticleMobility(physicsSettingIndex, vertexIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getValueByIndex(vertexIndex)
                .getValueByString(Mobility)
                .toFloat();
        }
        getParticleDelay(physicsSettingIndex, vertexIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getValueByIndex(vertexIndex)
                .getValueByString(Delay)
                .toFloat();
        }
        getParticleAcceleration(physicsSettingIndex, vertexIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getValueByIndex(vertexIndex)
                .getValueByString(Acceleration)
                .toFloat();
        }
        getParticleRadius(physicsSettingIndex, vertexIndex) {
            return this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getValueByIndex(vertexIndex)
                .getValueByString(Radius)
                .toFloat();
        }
        getParticlePosition(physicsSettingIndex, vertexIndex) {
            const ret = new cubismvector2_3.CubismVector2(0, 0);
            ret.x = this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getValueByIndex(vertexIndex)
                .getValueByString(Position)
                .getValueByString(X)
                .toFloat();
            ret.y = this._json
                .getRoot()
                .getValueByString(PhysicsSettings)
                .getValueByIndex(physicsSettingIndex)
                .getValueByString(Vertices)
                .getValueByIndex(vertexIndex)
                .getValueByString(Position)
                .getValueByString(Y)
                .toFloat();
            return ret;
        }
    }
    exports.CubismPhysicsJson = CubismPhysicsJson;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismPhysicsJson = $.CubismPhysicsJson;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/physics/cubismphysics", ["require", "exports", "framework/src/math/cubismmath", "framework/src/math/cubismvector2", "framework/src/utils/cubismarrayutils", "framework/src/physics/cubismphysicsinternal", "framework/src/physics/cubismphysicsjson", "framework/src/physics/cubismphysics"], function (require, exports, cubismmath_8, cubismvector2_4, cubismarrayutils_4, cubismphysicsinternal_1, cubismphysicsjson_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.PhysicsOutput = exports.Options = exports.CubismPhysics = void 0;
    const PhysicsTypeTagX = 'X';
    const PhysicsTypeTagY = 'Y';
    const PhysicsTypeTagAngle = 'Angle';
    const AirResistance = 5.0;
    const MaximumWeight = 100.0;
    const MovementThreshold = 0.001;
    const MaxDeltaTime = 5.0;
    class CubismPhysics {
        static create(buffer, size) {
            const ret = new CubismPhysics();
            ret.parse(buffer, size);
            ret._physicsRig.gravity.y = 0;
            return ret;
        }
        static delete(physics) {
            if (physics != null) {
                physics.release();
                physics = null;
            }
        }
        parse(physicsJson, size) {
            this._physicsRig = new cubismphysicsinternal_1.CubismPhysicsRig();
            let json = new cubismphysicsjson_1.CubismPhysicsJson(physicsJson, size);
            this._physicsRig.gravity = json.getGravity();
            this._physicsRig.wind = json.getWind();
            this._physicsRig.subRigCount = json.getSubRigCount();
            this._physicsRig.fps = json.getFps();
            (0, cubismarrayutils_4.updateSize)(this._physicsRig.settings, this._physicsRig.subRigCount, cubismphysicsinternal_1.CubismPhysicsSubRig, true);
            (0, cubismarrayutils_4.updateSize)(this._physicsRig.inputs, json.getTotalInputCount(), cubismphysicsinternal_1.CubismPhysicsInput, true);
            (0, cubismarrayutils_4.updateSize)(this._physicsRig.outputs, json.getTotalOutputCount(), cubismphysicsinternal_1.CubismPhysicsOutput, true);
            (0, cubismarrayutils_4.updateSize)(this._physicsRig.particles, json.getVertexCount(), cubismphysicsinternal_1.CubismPhysicsParticle, true);
            this._currentRigOutputs.length = 0;
            this._previousRigOutputs.length = 0;
            let inputIndex = 0, outputIndex = 0, particleIndex = 0;
            let dstIndexCurrentRigOutputs = this._currentRigOutputs.length;
            let dstIndexPreviousRigOutputs = this._previousRigOutputs.length;
            this._currentRigOutputs.length += this._physicsRig.settings.length;
            this._previousRigOutputs.length += this._physicsRig.settings.length;
            for (let i = 0; i < this._physicsRig.settings.length; ++i) {
                this._physicsRig.settings[i].normalizationPosition.minimum =
                    json.getNormalizationPositionMinimumValue(i);
                this._physicsRig.settings[i].normalizationPosition.maximum =
                    json.getNormalizationPositionMaximumValue(i);
                this._physicsRig.settings[i].normalizationPosition.defalut =
                    json.getNormalizationPositionDefaultValue(i);
                this._physicsRig.settings[i].normalizationAngle.minimum =
                    json.getNormalizationAngleMinimumValue(i);
                this._physicsRig.settings[i].normalizationAngle.maximum =
                    json.getNormalizationAngleMaximumValue(i);
                this._physicsRig.settings[i].normalizationAngle.defalut =
                    json.getNormalizationAngleDefaultValue(i);
                this._physicsRig.settings[i].inputCount = json.getInputCount(i);
                this._physicsRig.settings[i].baseInputIndex = inputIndex;
                for (let j = 0; j < this._physicsRig.settings[i].inputCount; ++j) {
                    this._physicsRig.inputs[inputIndex + j].sourceParameterIndex = -1;
                    this._physicsRig.inputs[inputIndex + j].weight = json.getInputWeight(i, j);
                    this._physicsRig.inputs[inputIndex + j].reflect = json.getInputReflect(i, j);
                    if (json.getInputType(i, j) == PhysicsTypeTagX) {
                        this._physicsRig.inputs[inputIndex + j].type =
                            cubismphysicsinternal_1.CubismPhysicsSource.CubismPhysicsSource_X;
                        this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue =
                            getInputTranslationXFromNormalizedParameterValue;
                    }
                    else if (json.getInputType(i, j) == PhysicsTypeTagY) {
                        this._physicsRig.inputs[inputIndex + j].type =
                            cubismphysicsinternal_1.CubismPhysicsSource.CubismPhysicsSource_Y;
                        this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue =
                            getInputTranslationYFromNormalizedParamterValue;
                    }
                    else if (json.getInputType(i, j) == PhysicsTypeTagAngle) {
                        this._physicsRig.inputs[inputIndex + j].type =
                            cubismphysicsinternal_1.CubismPhysicsSource.CubismPhysicsSource_Angle;
                        this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue =
                            getInputAngleFromNormalizedParameterValue;
                    }
                    this._physicsRig.inputs[inputIndex + j].source.targetType =
                        cubismphysicsinternal_1.CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;
                    this._physicsRig.inputs[inputIndex + j].source.id =
                        json.getInputSourceId(i, j);
                }
                inputIndex += this._physicsRig.settings[i].inputCount;
                this._physicsRig.settings[i].outputCount = json.getOutputCount(i);
                this._physicsRig.settings[i].baseOutputIndex = outputIndex;
                const currentRigOutput = new PhysicsOutput();
                (0, cubismarrayutils_4.updateSize)(currentRigOutput.outputs, this._physicsRig.settings[i].outputCount, null, true);
                const previousRigOutput = new PhysicsOutput();
                (0, cubismarrayutils_4.updateSize)(previousRigOutput.outputs, this._physicsRig.settings[i].outputCount, null, true);
                for (let j = 0; j < this._physicsRig.settings[i].outputCount; ++j) {
                    currentRigOutput.outputs[j] = 0.0;
                    previousRigOutput.outputs[j] = 0.0;
                    this._physicsRig.outputs[outputIndex + j].destinationParameterIndex =
                        -1;
                    this._physicsRig.outputs[outputIndex + j].vertexIndex =
                        json.getOutputVertexIndex(i, j);
                    this._physicsRig.outputs[outputIndex + j].angleScale =
                        json.getOutputAngleScale(i, j);
                    this._physicsRig.outputs[outputIndex + j].weight = json.getOutputWeight(i, j);
                    this._physicsRig.outputs[outputIndex + j].destination.targetType =
                        cubismphysicsinternal_1.CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;
                    this._physicsRig.outputs[outputIndex + j].destination.id =
                        json.getOutputDestinationId(i, j);
                    if (json.getOutputType(i, j) == PhysicsTypeTagX) {
                        this._physicsRig.outputs[outputIndex + j].type =
                            cubismphysicsinternal_1.CubismPhysicsSource.CubismPhysicsSource_X;
                        this._physicsRig.outputs[outputIndex + j].getValue =
                            getOutputTranslationX;
                        this._physicsRig.outputs[outputIndex + j].getScale =
                            getOutputScaleTranslationX;
                    }
                    else if (json.getOutputType(i, j) == PhysicsTypeTagY) {
                        this._physicsRig.outputs[outputIndex + j].type =
                            cubismphysicsinternal_1.CubismPhysicsSource.CubismPhysicsSource_Y;
                        this._physicsRig.outputs[outputIndex + j].getValue =
                            getOutputTranslationY;
                        this._physicsRig.outputs[outputIndex + j].getScale =
                            getOutputScaleTranslationY;
                    }
                    else if (json.getOutputType(i, j) == PhysicsTypeTagAngle) {
                        this._physicsRig.outputs[outputIndex + j].type =
                            cubismphysicsinternal_1.CubismPhysicsSource.CubismPhysicsSource_Angle;
                        this._physicsRig.outputs[outputIndex + j].getValue = getOutputAngle;
                        this._physicsRig.outputs[outputIndex + j].getScale =
                            getOutputScaleAngle;
                    }
                    this._physicsRig.outputs[outputIndex + j].reflect =
                        json.getOutputReflect(i, j);
                }
                this._currentRigOutputs[dstIndexCurrentRigOutputs++] = currentRigOutput;
                this._previousRigOutputs[dstIndexPreviousRigOutputs++] =
                    previousRigOutput;
                outputIndex += this._physicsRig.settings[i].outputCount;
                this._physicsRig.settings[i].particleCount = json.getParticleCount(i);
                this._physicsRig.settings[i].baseParticleIndex = particleIndex;
                for (let j = 0; j < this._physicsRig.settings[i].particleCount; ++j) {
                    this._physicsRig.particles[particleIndex + j].mobility =
                        json.getParticleMobility(i, j);
                    this._physicsRig.particles[particleIndex + j].delay =
                        json.getParticleDelay(i, j);
                    this._physicsRig.particles[particleIndex + j].acceleration =
                        json.getParticleAcceleration(i, j);
                    this._physicsRig.particles[particleIndex + j].radius =
                        json.getParticleRadius(i, j);
                    this._physicsRig.particles[particleIndex + j].position =
                        json.getParticlePosition(i, j);
                }
                particleIndex += this._physicsRig.settings[i].particleCount;
            }
            this.initialize();
            json.release();
            json = void 0;
            json = null;
        }
        stabilization(model) {
            var _a, _b, _c, _d;
            let totalAngle;
            let weight;
            let radAngle;
            let outputValue;
            const totalTranslation = new cubismvector2_4.CubismVector2();
            let currentSetting;
            let currentInputs;
            let currentOutputs;
            let currentParticles;
            const parameterValues = model.getModel().parameters.values;
            const parameterMaximumValues = model.getModel().parameters.maximumValues;
            const parameterMinimumValues = model.getModel().parameters.minimumValues;
            const parameterDefaultValues = model.getModel().parameters.defaultValues;
            if (((_b = (_a = this._parameterCaches) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) < model.getParameterCount()) {
                this._parameterCaches = new Float32Array(model.getParameterCount());
            }
            if (((_d = (_c = this._parameterInputCaches) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0) < model.getParameterCount()) {
                this._parameterInputCaches = new Float32Array(model.getParameterCount());
            }
            for (let j = 0; j < model.getParameterCount(); ++j) {
                this._parameterCaches[j] = parameterValues[j];
                this._parameterInputCaches[j] = parameterValues[j];
            }
            for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
                totalAngle = { angle: 0.0 };
                totalTranslation.x = 0.0;
                totalTranslation.y = 0.0;
                currentSetting = this._physicsRig.settings[settingIndex];
                currentInputs = this._physicsRig.inputs.slice(currentSetting.baseInputIndex);
                currentOutputs = this._physicsRig.outputs.slice(currentSetting.baseOutputIndex);
                currentParticles = this._physicsRig.particles.slice(currentSetting.baseParticleIndex);
                for (let i = 0; i < currentSetting.inputCount; ++i) {
                    weight = currentInputs[i].weight / MaximumWeight;
                    if (currentInputs[i].sourceParameterIndex == -1) {
                        currentInputs[i].sourceParameterIndex = model.getParameterIndex(currentInputs[i].source.id);
                    }
                    currentInputs[i].getNormalizedParameterValue(totalTranslation, totalAngle, parameterValues[currentInputs[i].sourceParameterIndex], parameterMinimumValues[currentInputs[i].sourceParameterIndex], parameterMaximumValues[currentInputs[i].sourceParameterIndex], parameterDefaultValues[currentInputs[i].sourceParameterIndex], currentSetting.normalizationPosition, currentSetting.normalizationAngle, currentInputs[i].reflect, weight);
                    this._parameterCaches[currentInputs[i].sourceParameterIndex] =
                        parameterValues[currentInputs[i].sourceParameterIndex];
                }
                radAngle = cubismmath_8.CubismMath.degreesToRadian(-totalAngle.angle);
                totalTranslation.x =
                    totalTranslation.x * cubismmath_8.CubismMath.cos(radAngle) -
                        totalTranslation.y * cubismmath_8.CubismMath.sin(radAngle);
                totalTranslation.y =
                    totalTranslation.x * cubismmath_8.CubismMath.sin(radAngle) +
                        totalTranslation.y * cubismmath_8.CubismMath.cos(radAngle);
                updateParticlesForStabilization(currentParticles, currentSetting.particleCount, totalTranslation, totalAngle.angle, this._options.wind, MovementThreshold * currentSetting.normalizationPosition.maximum);
                for (let i = 0; i < currentSetting.outputCount; ++i) {
                    const particleIndex = currentOutputs[i].vertexIndex;
                    if (currentOutputs[i].destinationParameterIndex == -1) {
                        currentOutputs[i].destinationParameterIndex = model.getParameterIndex(currentOutputs[i].destination.id);
                    }
                    if (particleIndex < 1 ||
                        particleIndex >= currentSetting.particleCount) {
                        continue;
                    }
                    let translation = new cubismvector2_4.CubismVector2();
                    translation = currentParticles[particleIndex].position.substract(currentParticles[particleIndex - 1].position);
                    outputValue = currentOutputs[i].getValue(translation, currentParticles, particleIndex, currentOutputs[i].reflect, this._options.gravity);
                    this._currentRigOutputs[settingIndex].outputs[i] = outputValue;
                    this._previousRigOutputs[settingIndex].outputs[i] = outputValue;
                    const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
                    const outParameterCaches = !Float32Array.prototype.slice && 'subarray' in Float32Array.prototype
                        ? JSON.parse(JSON.stringify(parameterValues.subarray(destinationParameterIndex)))
                        : parameterValues.slice(destinationParameterIndex);
                    updateOutputParameterValue(outParameterCaches, parameterMinimumValues[destinationParameterIndex], parameterMaximumValues[destinationParameterIndex], outputValue, currentOutputs[i]);
                    for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
                        parameterValues[offset] = this._parameterCaches[offset] =
                            outParameterCaches[outParamIndex];
                    }
                }
            }
        }
        evaluate(model, deltaTimeSeconds) {
            var _a, _b, _c, _d;
            let totalAngle;
            let weight;
            let radAngle;
            let outputValue;
            const totalTranslation = new cubismvector2_4.CubismVector2();
            let currentSetting;
            let currentInputs;
            let currentOutputs;
            let currentParticles;
            if (0.0 >= deltaTimeSeconds) {
                return;
            }
            const parameterValues = model.getModel().parameters.values;
            const parameterMaximumValues = model.getModel().parameters.maximumValues;
            const parameterMinimumValues = model.getModel().parameters.minimumValues;
            const parameterDefaultValues = model.getModel().parameters.defaultValues;
            let physicsDeltaTime;
            this._currentRemainTime += deltaTimeSeconds;
            if (this._currentRemainTime > MaxDeltaTime) {
                this._currentRemainTime = 0.0;
            }
            if (((_b = (_a = this._parameterCaches) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) < model.getParameterCount()) {
                this._parameterCaches = new Float32Array(model.getParameterCount());
            }
            if (((_d = (_c = this._parameterInputCaches) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0) < model.getParameterCount()) {
                this._parameterInputCaches = new Float32Array(model.getParameterCount());
                for (let j = 0; j < model.getParameterCount(); ++j) {
                    this._parameterInputCaches[j] = parameterValues[j];
                }
            }
            if (this._physicsRig.fps > 0.0) {
                physicsDeltaTime = 1.0 / this._physicsRig.fps;
            }
            else {
                physicsDeltaTime = deltaTimeSeconds;
            }
            while (this._currentRemainTime >= physicsDeltaTime) {
                for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
                    currentSetting = this._physicsRig.settings[settingIndex];
                    currentOutputs = this._physicsRig.outputs.slice(currentSetting.baseOutputIndex);
                    for (let i = 0; i < currentSetting.outputCount; ++i) {
                        this._previousRigOutputs[settingIndex].outputs[i] =
                            this._currentRigOutputs[settingIndex].outputs[i];
                    }
                }
                const inputWeight = physicsDeltaTime / this._currentRemainTime;
                for (let j = 0; j < model.getParameterCount(); ++j) {
                    this._parameterCaches[j] =
                        this._parameterInputCaches[j] * (1.0 - inputWeight) +
                            parameterValues[j] * inputWeight;
                    this._parameterInputCaches[j] = this._parameterCaches[j];
                }
                for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
                    totalAngle = { angle: 0.0 };
                    totalTranslation.x = 0.0;
                    totalTranslation.y = 0.0;
                    currentSetting = this._physicsRig.settings[settingIndex];
                    currentInputs = this._physicsRig.inputs.slice(currentSetting.baseInputIndex);
                    currentOutputs = this._physicsRig.outputs.slice(currentSetting.baseOutputIndex);
                    currentParticles = this._physicsRig.particles.slice(currentSetting.baseParticleIndex);
                    for (let i = 0; i < currentSetting.inputCount; ++i) {
                        weight = currentInputs[i].weight / MaximumWeight;
                        if (currentInputs[i].sourceParameterIndex == -1) {
                            currentInputs[i].sourceParameterIndex = model.getParameterIndex(currentInputs[i].source.id);
                        }
                        currentInputs[i].getNormalizedParameterValue(totalTranslation, totalAngle, this._parameterCaches[currentInputs[i].sourceParameterIndex], parameterMinimumValues[currentInputs[i].sourceParameterIndex], parameterMaximumValues[currentInputs[i].sourceParameterIndex], parameterDefaultValues[currentInputs[i].sourceParameterIndex], currentSetting.normalizationPosition, currentSetting.normalizationAngle, currentInputs[i].reflect, weight);
                    }
                    radAngle = cubismmath_8.CubismMath.degreesToRadian(-totalAngle.angle);
                    totalTranslation.x =
                        totalTranslation.x * cubismmath_8.CubismMath.cos(radAngle) -
                            totalTranslation.y * cubismmath_8.CubismMath.sin(radAngle);
                    totalTranslation.y =
                        totalTranslation.x * cubismmath_8.CubismMath.sin(radAngle) +
                            totalTranslation.y * cubismmath_8.CubismMath.cos(radAngle);
                    updateParticles(currentParticles, currentSetting.particleCount, totalTranslation, totalAngle.angle, this._options.wind, MovementThreshold * currentSetting.normalizationPosition.maximum, physicsDeltaTime, AirResistance);
                    for (let i = 0; i < currentSetting.outputCount; ++i) {
                        const particleIndex = currentOutputs[i].vertexIndex;
                        if (currentOutputs[i].destinationParameterIndex == -1) {
                            currentOutputs[i].destinationParameterIndex =
                                model.getParameterIndex(currentOutputs[i].destination.id);
                        }
                        if (particleIndex < 1 ||
                            particleIndex >= currentSetting.particleCount) {
                            continue;
                        }
                        const translation = new cubismvector2_4.CubismVector2();
                        translation.x =
                            currentParticles[particleIndex].position.x -
                                currentParticles[particleIndex - 1].position.x;
                        translation.y =
                            currentParticles[particleIndex].position.y -
                                currentParticles[particleIndex - 1].position.y;
                        outputValue = currentOutputs[i].getValue(translation, currentParticles, particleIndex, currentOutputs[i].reflect, this._options.gravity);
                        this._currentRigOutputs[settingIndex].outputs[i] = outputValue;
                        const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
                        const outParameterCaches = !Float32Array.prototype.slice &&
                            'subarray' in Float32Array.prototype
                            ? JSON.parse(JSON.stringify(this._parameterCaches.subarray(destinationParameterIndex)))
                            : this._parameterCaches.slice(destinationParameterIndex);
                        updateOutputParameterValue(outParameterCaches, parameterMinimumValues[destinationParameterIndex], parameterMaximumValues[destinationParameterIndex], outputValue, currentOutputs[i]);
                        for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
                            this._parameterCaches[offset] = outParameterCaches[outParamIndex];
                        }
                    }
                }
                this._currentRemainTime -= physicsDeltaTime;
            }
            const alpha = this._currentRemainTime / physicsDeltaTime;
            this.interpolate(model, alpha);
        }
        interpolate(model, weight) {
            let currentOutputs;
            let currentSetting;
            const parameterValues = model.getModel().parameters.values;
            const parameterMaximumValues = model.getModel().parameters.maximumValues;
            const parameterMinimumValues = model.getModel().parameters.minimumValues;
            for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
                currentSetting = this._physicsRig.settings[settingIndex];
                currentOutputs = this._physicsRig.outputs.slice(currentSetting.baseOutputIndex);
                for (let i = 0; i < currentSetting.outputCount; ++i) {
                    if (currentOutputs[i].destinationParameterIndex == -1) {
                        continue;
                    }
                    const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
                    const outParameterValues = !Float32Array.prototype.slice && 'subarray' in Float32Array.prototype
                        ? JSON.parse(JSON.stringify(parameterValues.subarray(destinationParameterIndex)))
                        : parameterValues.slice(destinationParameterIndex);
                    updateOutputParameterValue(outParameterValues, parameterMinimumValues[destinationParameterIndex], parameterMaximumValues[destinationParameterIndex], this._previousRigOutputs[settingIndex].outputs[i] * (1 - weight) +
                        this._currentRigOutputs[settingIndex].outputs[i] * weight, currentOutputs[i]);
                    for (let offset = destinationParameterIndex, outParamIndex = 0; offset < parameterValues.length; offset++, outParamIndex++) {
                        parameterValues[offset] = outParameterValues[outParamIndex];
                    }
                }
            }
        }
        setOptions(options) {
            this._options = options;
        }
        getOption() {
            return this._options;
        }
        constructor() {
            this._physicsRig = null;
            this._options = new Options();
            this._options.gravity.y = -1.0;
            this._options.gravity.x = 0.0;
            this._options.wind.x = 0.0;
            this._options.wind.y = 0.0;
            this._currentRigOutputs = new Array();
            this._previousRigOutputs = new Array();
            this._currentRemainTime = 0.0;
            this._parameterCaches = null;
            this._parameterInputCaches = null;
        }
        release() {
            this._physicsRig = void 0;
            this._physicsRig = null;
        }
        initialize() {
            let strand;
            let currentSetting;
            let radius;
            for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
                currentSetting = this._physicsRig.settings[settingIndex];
                strand = this._physicsRig.particles.slice(currentSetting.baseParticleIndex);
                strand[0].initialPosition = new cubismvector2_4.CubismVector2(0.0, 0.0);
                strand[0].lastPosition = new cubismvector2_4.CubismVector2(strand[0].initialPosition.x, strand[0].initialPosition.y);
                strand[0].lastGravity = new cubismvector2_4.CubismVector2(0.0, -1.0);
                strand[0].lastGravity.y *= -1.0;
                strand[0].velocity = new cubismvector2_4.CubismVector2(0.0, 0.0);
                strand[0].force = new cubismvector2_4.CubismVector2(0.0, 0.0);
                for (let i = 1; i < currentSetting.particleCount; ++i) {
                    radius = new cubismvector2_4.CubismVector2(0.0, 0.0);
                    radius.y = strand[i].radius;
                    strand[i].initialPosition = new cubismvector2_4.CubismVector2(strand[i - 1].initialPosition.x + radius.x, strand[i - 1].initialPosition.y + radius.y);
                    strand[i].position = new cubismvector2_4.CubismVector2(strand[i].initialPosition.x, strand[i].initialPosition.y);
                    strand[i].lastPosition = new cubismvector2_4.CubismVector2(strand[i].initialPosition.x, strand[i].initialPosition.y);
                    strand[i].lastGravity = new cubismvector2_4.CubismVector2(0.0, -1.0);
                    strand[i].lastGravity.y *= -1.0;
                    strand[i].velocity = new cubismvector2_4.CubismVector2(0.0, 0.0);
                    strand[i].force = new cubismvector2_4.CubismVector2(0.0, 0.0);
                }
            }
        }
    }
    exports.CubismPhysics = CubismPhysics;
    class Options {
        constructor() {
            this.gravity = new cubismvector2_4.CubismVector2(0, 0);
            this.wind = new cubismvector2_4.CubismVector2(0, 0);
        }
    }
    exports.Options = Options;
    class PhysicsOutput {
        constructor() {
            this.outputs = new Array(0);
        }
    }
    exports.PhysicsOutput = PhysicsOutput;
    function sign(value) {
        let ret = 0;
        if (value > 0.0) {
            ret = 1;
        }
        else if (value < 0.0) {
            ret = -1;
        }
        return ret;
    }
    function getInputTranslationXFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
        targetTranslation.x +=
            normalizeParameterValue(value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition.minimum, normalizationPosition.maximum, normalizationPosition.defalut, isInverted) * weight;
    }
    function getInputTranslationYFromNormalizedParamterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
        targetTranslation.y +=
            normalizeParameterValue(value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition.minimum, normalizationPosition.maximum, normalizationPosition.defalut, isInverted) * weight;
    }
    function getInputAngleFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizaitionPosition, normalizationAngle, isInverted, weight) {
        targetAngle.angle +=
            normalizeParameterValue(value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationAngle.minimum, normalizationAngle.maximum, normalizationAngle.defalut, isInverted) * weight;
    }
    function getOutputTranslationX(translation, particles, particleIndex, isInverted, parentGravity) {
        let outputValue = translation.x;
        if (isInverted) {
            outputValue *= -1.0;
        }
        return outputValue;
    }
    function getOutputTranslationY(translation, particles, particleIndex, isInverted, parentGravity) {
        let outputValue = translation.y;
        if (isInverted) {
            outputValue *= -1.0;
        }
        return outputValue;
    }
    function getOutputAngle(translation, particles, particleIndex, isInverted, parentGravity) {
        let outputValue;
        if (particleIndex >= 2) {
            parentGravity = particles[particleIndex - 1].position.substract(particles[particleIndex - 2].position);
        }
        else {
            parentGravity = parentGravity.multiplyByScaler(-1.0);
        }
        outputValue = cubismmath_8.CubismMath.directionToRadian(parentGravity, translation);
        if (isInverted) {
            outputValue *= -1.0;
        }
        return outputValue;
    }
    function getRangeValue(min, max) {
        const maxValue = cubismmath_8.CubismMath.max(min, max);
        const minValue = cubismmath_8.CubismMath.min(min, max);
        return cubismmath_8.CubismMath.abs(maxValue - minValue);
    }
    function getDefaultValue(min, max) {
        const minValue = cubismmath_8.CubismMath.min(min, max);
        return minValue + getRangeValue(min, max) / 2.0;
    }
    function getOutputScaleTranslationX(translationScale, angleScale) {
        return JSON.parse(JSON.stringify(translationScale.x));
    }
    function getOutputScaleTranslationY(translationScale, angleScale) {
        return JSON.parse(JSON.stringify(translationScale.y));
    }
    function getOutputScaleAngle(translationScale, angleScale) {
        return JSON.parse(JSON.stringify(angleScale));
    }
    function updateParticles(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue, deltaTimeSeconds, airResistance) {
        let delay;
        let radian;
        let direction = new cubismvector2_4.CubismVector2(0.0, 0.0);
        let velocity = new cubismvector2_4.CubismVector2(0.0, 0.0);
        let force = new cubismvector2_4.CubismVector2(0.0, 0.0);
        let newDirection = new cubismvector2_4.CubismVector2(0.0, 0.0);
        strand[0].position = new cubismvector2_4.CubismVector2(totalTranslation.x, totalTranslation.y);
        const totalRadian = cubismmath_8.CubismMath.degreesToRadian(totalAngle);
        const currentGravity = cubismmath_8.CubismMath.radianToDirection(totalRadian);
        currentGravity.normalize();
        for (let i = 1; i < strandCount; ++i) {
            strand[i].force = currentGravity
                .multiplyByScaler(strand[i].acceleration)
                .add(windDirection);
            strand[i].lastPosition = new cubismvector2_4.CubismVector2(strand[i].position.x, strand[i].position.y);
            delay = strand[i].delay * deltaTimeSeconds * 30.0;
            direction = strand[i].position.substract(strand[i - 1].position);
            radian =
                cubismmath_8.CubismMath.directionToRadian(strand[i].lastGravity, currentGravity) /
                    airResistance;
            direction.x =
                cubismmath_8.CubismMath.cos(radian) * direction.x -
                    direction.y * cubismmath_8.CubismMath.sin(radian);
            direction.y =
                cubismmath_8.CubismMath.sin(radian) * direction.x +
                    direction.y * cubismmath_8.CubismMath.cos(radian);
            strand[i].position = strand[i - 1].position.add(direction);
            velocity = strand[i].velocity.multiplyByScaler(delay);
            force = strand[i].force.multiplyByScaler(delay).multiplyByScaler(delay);
            strand[i].position = strand[i].position.add(velocity).add(force);
            newDirection = strand[i].position.substract(strand[i - 1].position);
            newDirection.normalize();
            strand[i].position = strand[i - 1].position.add(newDirection.multiplyByScaler(strand[i].radius));
            if (cubismmath_8.CubismMath.abs(strand[i].position.x) < thresholdValue) {
                strand[i].position.x = 0.0;
            }
            if (delay != 0.0) {
                strand[i].velocity = strand[i].position.substract(strand[i].lastPosition);
                strand[i].velocity = strand[i].velocity.divisionByScalar(delay);
                strand[i].velocity = strand[i].velocity.multiplyByScaler(strand[i].mobility);
            }
            strand[i].force = new cubismvector2_4.CubismVector2(0.0, 0.0);
            strand[i].lastGravity = new cubismvector2_4.CubismVector2(currentGravity.x, currentGravity.y);
        }
    }
    function updateParticlesForStabilization(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue) {
        let force = new cubismvector2_4.CubismVector2(0.0, 0.0);
        strand[0].position = new cubismvector2_4.CubismVector2(totalTranslation.x, totalTranslation.y);
        const totalRadian = cubismmath_8.CubismMath.degreesToRadian(totalAngle);
        const currentGravity = cubismmath_8.CubismMath.radianToDirection(totalRadian);
        currentGravity.normalize();
        for (let i = 1; i < strandCount; ++i) {
            strand[i].force = currentGravity
                .multiplyByScaler(strand[i].acceleration)
                .add(windDirection);
            strand[i].lastPosition = new cubismvector2_4.CubismVector2(strand[i].position.x, strand[i].position.y);
            strand[i].velocity = new cubismvector2_4.CubismVector2(0.0, 0.0);
            force = strand[i].force;
            force.normalize();
            force = force.multiplyByScaler(strand[i].radius);
            strand[i].position = strand[i - 1].position.add(force);
            if (cubismmath_8.CubismMath.abs(strand[i].position.x) < thresholdValue) {
                strand[i].position.x = 0.0;
            }
            strand[i].force = new cubismvector2_4.CubismVector2(0.0, 0.0);
            strand[i].lastGravity = new cubismvector2_4.CubismVector2(currentGravity.x, currentGravity.y);
        }
    }
    function updateOutputParameterValue(parameterValue, parameterValueMinimum, parameterValueMaximum, translation, output) {
        let value;
        const outputScale = output.getScale(output.translationScale, output.angleScale);
        value = translation * outputScale;
        if (value < parameterValueMinimum) {
            if (value < output.valueBelowMinimum) {
                output.valueBelowMinimum = value;
            }
            value = parameterValueMinimum;
        }
        else if (value > parameterValueMaximum) {
            if (value > output.valueExceededMaximum) {
                output.valueExceededMaximum = value;
            }
            value = parameterValueMaximum;
        }
        const weight = output.weight / MaximumWeight;
        if (weight >= 1.0) {
            parameterValue[0] = value;
        }
        else {
            value = parameterValue[0] * (1.0 - weight) + value * weight;
            parameterValue[0] = value;
        }
    }
    function normalizeParameterValue(value, parameterMinimum, parameterMaximum, parameterDefault, normalizedMinimum, normalizedMaximum, normalizedDefault, isInverted) {
        let result = 0.0;
        const maxValue = cubismmath_8.CubismMath.max(parameterMaximum, parameterMinimum);
        if (maxValue < value) {
            value = maxValue;
        }
        const minValue = cubismmath_8.CubismMath.min(parameterMaximum, parameterMinimum);
        if (minValue > value) {
            value = minValue;
        }
        const minNormValue = cubismmath_8.CubismMath.min(normalizedMinimum, normalizedMaximum);
        const maxNormValue = cubismmath_8.CubismMath.max(normalizedMinimum, normalizedMaximum);
        const middleNormValue = normalizedDefault;
        const middleValue = getDefaultValue(minValue, maxValue);
        const paramValue = value - middleValue;
        switch (sign(paramValue)) {
            case 1: {
                const nLength = maxNormValue - middleNormValue;
                const pLength = maxValue - middleValue;
                if (pLength != 0.0) {
                    result = paramValue * (nLength / pLength);
                    result += middleNormValue;
                }
                break;
            }
            case -1: {
                const nLength = minNormValue - middleNormValue;
                const pLength = minValue - middleValue;
                if (pLength != 0.0) {
                    result = paramValue * (nLength / pLength);
                    result += middleNormValue;
                }
                break;
            }
            case 0: {
                result = middleNormValue;
                break;
            }
            default: {
                break;
            }
        }
        return isInverted ? result : result * -1.0;
    }
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismPhysics = $.CubismPhysics;
        Live2DCubismFramework.Options = $.Options;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/model/cubismmodeluserdatajson", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/utils/cubismjson", "framework/src/model/cubismmodeluserdatajson"], function (require, exports, live2dcubismframework_14, cubismjson_8, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismModelUserDataJson = void 0;
    const Meta = 'Meta';
    const UserDataCount = 'UserDataCount';
    const TotalUserDataSize = 'TotalUserDataSize';
    const UserData = 'UserData';
    const Target = 'Target';
    const Id = 'Id';
    const Value = 'Value';
    class CubismModelUserDataJson {
        constructor(buffer, size) {
            this._json = cubismjson_8.CubismJson.create(buffer, size);
        }
        release() {
            cubismjson_8.CubismJson.delete(this._json);
        }
        getUserDataCount() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(UserDataCount)
                .toInt();
        }
        getTotalUserDataSize() {
            return this._json
                .getRoot()
                .getValueByString(Meta)
                .getValueByString(TotalUserDataSize)
                .toInt();
        }
        getUserDataTargetType(i) {
            return this._json
                .getRoot()
                .getValueByString(UserData)
                .getValueByIndex(i)
                .getValueByString(Target)
                .getRawString();
        }
        getUserDataId(i) {
            return live2dcubismframework_14.CubismFramework.getIdManager().getId(this._json
                .getRoot()
                .getValueByString(UserData)
                .getValueByIndex(i)
                .getValueByString(Id)
                .getRawString());
        }
        getUserDataValue(i) {
            return this._json
                .getRoot()
                .getValueByString(UserData)
                .getValueByIndex(i)
                .getValueByString(Value)
                .getRawString();
        }
    }
    exports.CubismModelUserDataJson = CubismModelUserDataJson;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismModelUserDataJson = $.CubismModelUserDataJson;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/model/cubismmodeluserdata", ["require", "exports", "framework/src/live2dcubismframework", "framework/src/model/cubismmodeluserdatajson", "framework/src/model/cubismmodeluserdata"], function (require, exports, live2dcubismframework_15, cubismmodeluserdatajson_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismModelUserData = exports.CubismModelUserDataNode = void 0;
    const ArtMesh = 'ArtMesh';
    class CubismModelUserDataNode {
    }
    exports.CubismModelUserDataNode = CubismModelUserDataNode;
    class CubismModelUserData {
        static create(buffer, size) {
            const ret = new CubismModelUserData();
            ret.parseUserData(buffer, size);
            return ret;
        }
        static delete(modelUserData) {
            if (modelUserData != null) {
                modelUserData.release();
                modelUserData = null;
            }
        }
        getArtMeshUserDatas() {
            return this._artMeshUserDataNode;
        }
        parseUserData(buffer, size) {
            let json = new cubismmodeluserdatajson_1.CubismModelUserDataJson(buffer, size);
            if (!json) {
                json.release();
                json = void 0;
                return;
            }
            const typeOfArtMesh = live2dcubismframework_15.CubismFramework.getIdManager().getId(ArtMesh);
            const nodeCount = json.getUserDataCount();
            let dstIndex = this._userDataNodes.length;
            this._userDataNodes.length = nodeCount;
            for (let i = 0; i < nodeCount; i++) {
                const addNode = new CubismModelUserDataNode();
                addNode.targetId = json.getUserDataId(i);
                addNode.targetType = live2dcubismframework_15.CubismFramework.getIdManager().getId(json.getUserDataTargetType(i));
                addNode.value = json.getUserDataValue(i);
                this._userDataNodes[dstIndex++] = addNode;
                if (addNode.targetType == typeOfArtMesh) {
                    this._artMeshUserDataNode.push(addNode);
                }
            }
            json.release();
            json = void 0;
        }
        constructor() {
            this._userDataNodes = new Array();
            this._artMeshUserDataNode = new Array();
        }
        release() {
            for (let i = 0; i < this._userDataNodes.length; ++i) {
                this._userDataNodes[i] = null;
            }
            this._userDataNodes = null;
        }
    }
    exports.CubismModelUserData = CubismModelUserData;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismModelUserData = $.CubismModelUserData;
        Live2DCubismFramework.CubismModelUserDataNode = $.CubismModelUserDataNode;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/model/cubismusermodel", ["require", "exports", "framework/src/effect/cubismbreath", "framework/src/effect/cubismeyeblink", "framework/src/effect/cubismpose", "framework/src/live2dcubismframework", "framework/src/math/cubismmodelmatrix", "framework/src/math/cubismtargetpoint", "framework/src/motion/cubismexpressionmotion", "framework/src/motion/cubismexpressionmotionmanager", "framework/src/motion/cubismmotion", "framework/src/motion/cubismmotionmanager", "framework/src/physics/cubismphysics", "framework/src/rendering/cubismrenderer_webgl", "framework/src/utils/cubismdebug", "framework/src/model/cubismmoc", "framework/src/model/cubismmodeluserdata", "framework/src/model/cubismusermodel"], function (require, exports, cubismbreath_1, cubismeyeblink_1, cubismpose_1, live2dcubismframework_16, cubismmodelmatrix_1, cubismtargetpoint_1, cubismexpressionmotion_2, cubismexpressionmotionmanager_1, cubismmotion_1, cubismmotionmanager_1, cubismphysics_1, cubismrenderer_webgl_1, cubismdebug_16, cubismmoc_1, cubismmodeluserdata_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismUserModel = void 0;
    class CubismUserModel {
        isInitialized() {
            return this._initialized;
        }
        setInitialized(v) {
            this._initialized = v;
        }
        isUpdating() {
            return this._updating;
        }
        setUpdating(v) {
            this._updating = v;
        }
        setDragging(x, y) {
            this._dragManager.set(x, y);
        }
        getModelMatrix() {
            return this._modelMatrix;
        }
        setRenderTargetSize(width, height) {
            if (this._renderer) {
                this._renderer.setRenderTargetSize(width, height);
            }
        }
        setOpacity(a) {
            this._opacity = a;
        }
        getOpacity() {
            return this._opacity;
        }
        loadModel(buffer, shouldCheckMocConsistency = false) {
            this._moc = cubismmoc_1.CubismMoc.create(buffer, shouldCheckMocConsistency);
            if (this._moc == null) {
                (0, cubismdebug_16.CubismLogError)('Failed to CubismMoc.create().');
                return;
            }
            this._model = this._moc.createModel();
            if (this._model == null) {
                (0, cubismdebug_16.CubismLogError)('Failed to CreateModel().');
                return;
            }
            this._model.saveParameters();
            this._modelMatrix = new cubismmodelmatrix_1.CubismModelMatrix(this._model.getCanvasWidth(), this._model.getCanvasHeight());
        }
        loadMotion(buffer, size, name, onFinishedMotionHandler, onBeganMotionHandler, modelSetting, group, index, shouldCheckMotionConsistency = false) {
            if (buffer == null || size == 0) {
                (0, cubismdebug_16.CubismLogError)('Failed to loadMotion().');
                return null;
            }
            const motion = cubismmotion_1.CubismMotion.create(buffer, size, onFinishedMotionHandler, onBeganMotionHandler, shouldCheckMotionConsistency);
            if (motion == null) {
                (0, cubismdebug_16.CubismLogError)(`Failed to create motion from buffer in LoadMotion()`);
                return null;
            }
            if (modelSetting) {
                const fadeInTime = modelSetting.getMotionFadeInTimeValue(group, index);
                if (fadeInTime >= 0.0) {
                    motion.setFadeInTime(fadeInTime);
                }
                const fadeOutTime = modelSetting.getMotionFadeOutTimeValue(group, index);
                if (fadeOutTime >= 0.0) {
                    motion.setFadeOutTime(fadeOutTime);
                }
            }
            return motion;
        }
        loadExpression(buffer, size, name) {
            if (buffer == null || size == 0) {
                (0, cubismdebug_16.CubismLogError)('Failed to loadExpression().');
                return null;
            }
            return cubismexpressionmotion_2.CubismExpressionMotion.create(buffer, size);
        }
        loadPose(buffer, size) {
            if (buffer == null || size == 0) {
                (0, cubismdebug_16.CubismLogError)('Failed to loadPose().');
                return;
            }
            this._pose = cubismpose_1.CubismPose.create(buffer, size);
        }
        loadUserData(buffer, size) {
            if (buffer == null || size == 0) {
                (0, cubismdebug_16.CubismLogError)('Failed to loadUserData().');
                return;
            }
            this._modelUserData = cubismmodeluserdata_1.CubismModelUserData.create(buffer, size);
        }
        loadPhysics(buffer, size) {
            if (buffer == null || size == 0) {
                (0, cubismdebug_16.CubismLogError)('Failed to loadPhysics().');
                return;
            }
            this._physics = cubismphysics_1.CubismPhysics.create(buffer, size);
        }
        isHit(drawableId, pointX, pointY) {
            const drawIndex = this._model.getDrawableIndex(drawableId);
            if (drawIndex < 0) {
                return false;
            }
            const count = this._model.getDrawableVertexCount(drawIndex);
            const vertices = this._model.getDrawableVertices(drawIndex);
            let left = vertices[0];
            let right = vertices[0];
            let top = vertices[1];
            let bottom = vertices[1];
            for (let j = 1; j < count; ++j) {
                const x = vertices[live2dcubismframework_16.Constant.vertexOffset + j * live2dcubismframework_16.Constant.vertexStep];
                const y = vertices[live2dcubismframework_16.Constant.vertexOffset + j * live2dcubismframework_16.Constant.vertexStep + 1];
                if (x < left) {
                    left = x;
                }
                if (x > right) {
                    right = x;
                }
                if (y < top) {
                    top = y;
                }
                if (y > bottom) {
                    bottom = y;
                }
            }
            const tx = this._modelMatrix.invertTransformX(pointX);
            const ty = this._modelMatrix.invertTransformY(pointY);
            return left <= tx && tx <= right && top <= ty && ty <= bottom;
        }
        getModel() {
            return this._model;
        }
        getMocVersionFromBuffer(mocBytes) {
            return cubismmoc_1.CubismMoc.getMocVersionFromBuffer(mocBytes);
        }
        getRenderer() {
            return this._renderer;
        }
        createRenderer(width, height, maskBufferCount = 1) {
            if (this._renderer) {
                this.deleteRenderer();
            }
            this._renderer = new cubismrenderer_webgl_1.CubismRenderer_WebGL(width, height);
            this._renderer.initialize(this._model, maskBufferCount);
        }
        deleteRenderer() {
            if (this._renderer != null) {
                this._renderer.release();
                this._renderer = null;
            }
        }
        motionEventFired(eventValue) {
            (0, cubismdebug_16.CubismLogInfo)('{0}', eventValue);
        }
        static cubismDefaultMotionEventCallback(caller, eventValue, customData) {
            const model = customData;
            if (model != null) {
                model.motionEventFired(eventValue);
            }
        }
        constructor() {
            this._moc = null;
            this._model = null;
            this._motionManager = null;
            this._expressionManager = null;
            this._eyeBlink = null;
            this._breath = null;
            this._modelMatrix = null;
            this._pose = null;
            this._dragManager = null;
            this._physics = null;
            this._modelUserData = null;
            this._initialized = false;
            this._updating = false;
            this._opacity = 1.0;
            this._mocConsistency = false;
            this._debugMode = false;
            this._renderer = null;
            this._motionManager = new cubismmotionmanager_1.CubismMotionManager();
            this._motionManager.setEventCallback(CubismUserModel.cubismDefaultMotionEventCallback, this);
            this._expressionManager = new cubismexpressionmotionmanager_1.CubismExpressionMotionManager();
            this._dragManager = new cubismtargetpoint_1.CubismTargetPoint();
        }
        release() {
            if (this._motionManager != null) {
                this._motionManager.release();
                this._motionManager = null;
            }
            if (this._expressionManager != null) {
                this._expressionManager.release();
                this._expressionManager = null;
            }
            if (this._moc != null) {
                this._moc.deleteModel(this._model);
                this._moc.release();
                this._moc = null;
            }
            this._modelMatrix = null;
            cubismpose_1.CubismPose.delete(this._pose);
            cubismeyeblink_1.CubismEyeBlink.delete(this._eyeBlink);
            cubismbreath_1.CubismBreath.delete(this._breath);
            this._dragManager = null;
            cubismphysics_1.CubismPhysics.delete(this._physics);
            cubismmodeluserdata_1.CubismModelUserData.delete(this._modelUserData);
            this.deleteRenderer();
        }
    }
    exports.CubismUserModel = CubismUserModel;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismUserModel = $.CubismUserModel;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/icubismupdater", ["require", "exports", "framework/src/motion/icubismupdater"], function (require, exports, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.ICubismUpdater = exports.CubismUpdateOrder = void 0;
    var CubismUpdateOrder;
    (function (CubismUpdateOrder) {
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_EyeBlink"] = 200] = "CubismUpdateOrder_EyeBlink";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Expression"] = 300] = "CubismUpdateOrder_Expression";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Drag"] = 400] = "CubismUpdateOrder_Drag";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Breath"] = 500] = "CubismUpdateOrder_Breath";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Physics"] = 600] = "CubismUpdateOrder_Physics";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_LipSync"] = 700] = "CubismUpdateOrder_LipSync";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Pose"] = 800] = "CubismUpdateOrder_Pose";
        CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Max"] = Number.MAX_SAFE_INTEGER] = "CubismUpdateOrder_Max";
    })(CubismUpdateOrder || (exports.CubismUpdateOrder = CubismUpdateOrder = {}));
    class ICubismUpdater {
        static sortFunction(left, right) {
            if (!left || !right) {
                if (!left && !right)
                    return 0;
                if (!left)
                    return 1;
                if (!right)
                    return -1;
            }
            return left.getExecutionOrder() - right.getExecutionOrder();
        }
        constructor(executionOrder = 0) {
            this._changeListeners = [];
            this._executionOrder = executionOrder;
        }
        getExecutionOrder() {
            return this._executionOrder;
        }
        setExecutionOrder(executionOrder) {
            if (this._executionOrder !== executionOrder) {
                this._executionOrder = executionOrder;
                this.notifyChangeListeners();
            }
        }
        addChangeListener(listener) {
            if (listener && this._changeListeners.indexOf(listener) === -1) {
                this._changeListeners.push(listener);
            }
        }
        removeChangeListener(listener) {
            const index = this._changeListeners.indexOf(listener);
            if (index >= 0) {
                this._changeListeners.splice(index, 1);
            }
        }
        notifyChangeListeners() {
            for (const listener of this._changeListeners) {
                listener.onUpdaterChanged(this);
            }
        }
    }
    exports.ICubismUpdater = ICubismUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.ICubismUpdater = $.ICubismUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismupdatescheduler", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismupdatescheduler"], function (require, exports, icubismupdater_1, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismUpdateScheduler = void 0;
    class CubismUpdateScheduler {
        constructor() {
            this._cubismUpdatableList = [];
            this._needsSort = false;
        }
        release() {
            for (const updater of this._cubismUpdatableList) {
                if (updater) {
                    updater.removeChangeListener(this);
                }
            }
            this._cubismUpdatableList.length = 0;
        }
        addUpdatableList(updatable) {
            if (!updatable) {
                return;
            }
            if (this.hasUpdatable(updatable)) {
                return;
            }
            this._cubismUpdatableList.push(updatable);
            updatable.addChangeListener(this);
            this._needsSort = true;
        }
        removeUpdatableList(updatable) {
            if (!updatable) {
                return false;
            }
            const index = this._cubismUpdatableList.indexOf(updatable);
            if (index >= 0) {
                this._cubismUpdatableList.splice(index, 1);
                updatable.removeChangeListener(this);
                return true;
            }
            return false;
        }
        sortUpdatableList() {
            this._cubismUpdatableList.sort(icubismupdater_1.ICubismUpdater.sortFunction);
            this._needsSort = false;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            if (this._needsSort) {
                this.sortUpdatableList();
            }
            for (let i = 0; i < this._cubismUpdatableList.length; ++i) {
                const updater = this._cubismUpdatableList[i];
                if (updater) {
                    updater.onLateUpdate(model, deltaTimeSeconds);
                }
            }
        }
        getUpdatableCount() {
            return this._cubismUpdatableList.length;
        }
        getUpdatable(index) {
            if (index < 0 || index >= this._cubismUpdatableList.length) {
                return null;
            }
            return this._cubismUpdatableList[index];
        }
        hasUpdatable(updatable) {
            return this._cubismUpdatableList.indexOf(updatable) >= 0;
        }
        clearUpdatableList() {
            for (const updater of this._cubismUpdatableList) {
                if (updater) {
                    updater.removeChangeListener(this);
                }
            }
            this._cubismUpdatableList.length = 0;
            this._needsSort = false;
        }
        onUpdaterChanged(updater) {
            this._needsSort = true;
        }
    }
    exports.CubismUpdateScheduler = CubismUpdateScheduler;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismUpdateScheduler = $.CubismUpdateScheduler;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismeyeblinkupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismeyeblinkupdater"], function (require, exports, icubismupdater_2, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismEyeBlinkUpdater = void 0;
    class CubismEyeBlinkUpdater extends icubismupdater_2.ICubismUpdater {
        constructor(motionUpdated, eyeBlink, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_2.CubismUpdateOrder.CubismUpdateOrder_EyeBlink);
            this._motionUpdated = motionUpdated;
            this._eyeBlink = eyeBlink;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            if (!this._motionUpdated()) {
                this._eyeBlink.updateParameters(model, deltaTimeSeconds);
            }
        }
    }
    exports.CubismEyeBlinkUpdater = CubismEyeBlinkUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismEyeBlinkUpdater = $.CubismEyeBlinkUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismexpressionupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismexpressionupdater"], function (require, exports, icubismupdater_3, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismExpressionUpdater = void 0;
    class CubismExpressionUpdater extends icubismupdater_3.ICubismUpdater {
        constructor(expressionManager, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_3.CubismUpdateOrder.CubismUpdateOrder_Expression);
            this._expressionManager = expressionManager;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            this._expressionManager.updateMotion(model, deltaTimeSeconds);
        }
    }
    exports.CubismExpressionUpdater = CubismExpressionUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismExpressionUpdater = $.CubismExpressionUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismlookupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismlookupdater"], function (require, exports, icubismupdater_4, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismLookUpdater = void 0;
    class CubismLookUpdater extends icubismupdater_4.ICubismUpdater {
        constructor(look, dragManager, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_4.CubismUpdateOrder.CubismUpdateOrder_Drag);
            this._look = look;
            this._dragManager = dragManager;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            this._dragManager.update(deltaTimeSeconds);
            const dragX = this._dragManager.getX();
            const dragY = this._dragManager.getY();
            this._look.updateParameters(model, dragX, dragY);
        }
    }
    exports.CubismLookUpdater = CubismLookUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismLookUpdater = $.CubismLookUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismbreathupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismbreathupdater"], function (require, exports, icubismupdater_5, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismBreathUpdater = void 0;
    class CubismBreathUpdater extends icubismupdater_5.ICubismUpdater {
        constructor(breath, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_5.CubismUpdateOrder.CubismUpdateOrder_Breath);
            this._breath = breath;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            this._breath.updateParameters(model, deltaTimeSeconds);
        }
    }
    exports.CubismBreathUpdater = CubismBreathUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismBreathUpdater = $.CubismBreathUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismphysicsupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismphysicsupdater"], function (require, exports, icubismupdater_6, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismPhysicsUpdater = void 0;
    class CubismPhysicsUpdater extends icubismupdater_6.ICubismUpdater {
        constructor(physics, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_6.CubismUpdateOrder.CubismUpdateOrder_Physics);
            this._physics = physics;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            this._physics.evaluate(model, deltaTimeSeconds);
        }
    }
    exports.CubismPhysicsUpdater = CubismPhysicsUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismPhysicsUpdater = $.CubismPhysicsUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismposeupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismposeupdater"], function (require, exports, icubismupdater_7, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismPoseUpdater = void 0;
    class CubismPoseUpdater extends icubismupdater_7.ICubismUpdater {
        constructor(pose, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_7.CubismUpdateOrder.CubismUpdateOrder_Pose);
            this._pose = pose;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            this._pose.updateParameters(model, deltaTimeSeconds);
        }
    }
    exports.CubismPoseUpdater = CubismPoseUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismPoseUpdater = $.CubismPoseUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("framework/src/motion/cubismlipsyncupdater", ["require", "exports", "framework/src/motion/icubismupdater", "framework/src/motion/cubismlipsyncupdater"], function (require, exports, icubismupdater_8, $) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCubismFramework = exports.CubismLipSyncUpdater = void 0;
    class CubismLipSyncUpdater extends icubismupdater_8.ICubismUpdater {
        constructor(lipSyncIds, audioProvider, executionOrder) {
            super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : icubismupdater_8.CubismUpdateOrder.CubismUpdateOrder_LipSync);
            this._lipSyncIds = [...lipSyncIds];
            this._audioProvider = audioProvider;
        }
        onLateUpdate(model, deltaTimeSeconds) {
            if (!model) {
                return;
            }
            if (this._audioProvider) {
                const updateSuccessful = this._audioProvider.update(deltaTimeSeconds);
                if (updateSuccessful) {
                    const lipSyncValue = this._audioProvider.getParameter();
                    for (let i = 0; i < this._lipSyncIds.length; i++) {
                        model.addParameterValueById(this._lipSyncIds[i], lipSyncValue);
                    }
                }
            }
        }
        setAudioProvider(audioProvider) {
            this._audioProvider = audioProvider;
        }
        getAudioProvider() {
            return this._audioProvider;
        }
    }
    exports.CubismLipSyncUpdater = CubismLipSyncUpdater;
    var Live2DCubismFramework;
    (function (Live2DCubismFramework) {
        Live2DCubismFramework.CubismLipSyncUpdater = $.CubismLipSyncUpdater;
    })(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
});
define("src/model", ["require", "exports", "framework/src/cubismdefaultparameterid", "framework/src/cubismmodelsettingjson", "framework/src/effect/cubismbreath", "framework/src/effect/cubismeyeblink", "framework/src/effect/cubismlook", "framework/src/live2dcubismframework", "framework/src/model/cubismmoc", "framework/src/model/cubismusermodel", "framework/src/motion/acubismmotion", "framework/src/motion/cubismmotionqueuemanager", "framework/src/motion/cubismupdatescheduler", "framework/src/motion/cubismeyeblinkupdater", "framework/src/motion/cubismexpressionupdater", "framework/src/motion/cubismlookupdater", "framework/src/motion/cubismbreathupdater", "framework/src/motion/cubismphysicsupdater", "framework/src/motion/cubismposeupdater", "framework/src/motion/cubismlipsyncupdater", "framework/src/rendering/cubismshader_webgl", "src/core"], function (require, exports, cubismdefaultparameterid_1, cubismmodelsettingjson_1, cubismbreath_2, cubismeyeblink_2, cubismlook_1, live2dcubismframework_17, cubismmoc_2, cubismusermodel_1, acubismmotion_4, cubismmotionqueuemanager_3, cubismupdatescheduler_1, cubismeyeblinkupdater_1, cubismexpressionupdater_1, cubismlookupdater_1, cubismbreathupdater_1, cubismphysicsupdater_1, cubismposeupdater_1, cubismlipsyncupdater_1, cubismshader_webgl_2, core_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DModel = exports.idOf = exports.Priority = void 0;
    exports.Priority = { None: 0, Idle: 1, Normal: 2, Force: 3 };
    const idOf = (s) => live2dcubismframework_17.CubismFramework.getIdManager().getId(s);
    exports.idOf = idOf;
    const idStr = (h) => {
        const v = h.getString();
        return typeof v === 'string' ? v : v && typeof v.s === 'string' ? v.s : String(v);
    };
    class Live2DModel extends cubismusermodel_1.CubismUserModel {
        constructor(url, assets) {
            super();
            this.assets = assets;
            this.setting = null;
            this.caps = null;
            this.ready = false;
            this.scheduler = new cubismupdatescheduler_1.CubismUpdateScheduler();
            this.physicsUpdater = null;
            this.lipSyncUpdater = null;
            this.motionsLoaded = new Map();
            this.expressionsLoaded = new Map();
            this.eyeBlinkIds = [];
            this.lipSyncIds = [];
            this.textures = [];
            this.gl = null;
            this.motionUpdated = false;
            this.look = null;
            this.physicsOn = true;
            this.shaderPath = 'live2d/shaders/WebGL/';
            this.released = false;
            this.posePartCache = null;
            this.pendingMotions = [];
            this.currentMotion = '';
            this.idleGroup = '';
            this.autoIdleMotion = true;
            this.url = url;
            this.homeDir = url.slice(0, url.lastIndexOf('/') + 1);
        }
        path(file) {
            return this.homeDir + file;
        }
        async load(gl, width, height, opts = {}) {
            this.gl = gl;
            if (opts.shaderPath)
                this.shaderPath = opts.shaderPath;
            try {
                const settingBuf = await this.assets.fetchBuffer(this.url);
                let parsed;
                try {
                    parsed = JSON.parse(new TextDecoder().decode(settingBuf));
                }
                catch (e) {
                    throw new Error(`${this.url} 不是有效的 JSON`);
                }
                if (!parsed || !parsed.FileReferences || !parsed.FileReferences.Moc) {
                    throw new Error(`${this.url} 不是 model3.json（缺少 FileReferences.Moc）`);
                }
                const setting = new cubismmodelsettingjson_1.CubismModelSettingJson(settingBuf, settingBuf.byteLength);
                this.setting = setting;
                const mocBuf = await this.assets.fetchBuffer(this.path(setting.getModelFileName()));
                if (opts.checkMocConsistency !== false && !cubismmoc_2.CubismMoc.hasMocConsistency(mocBuf)) {
                    throw new Error(`${setting.getModelFileName()} 未通过 moc3 一致性检查（文件损坏或不是 moc3）`);
                }
                const mocVersion = this.getMocVersionFromBuffer(mocBuf);
                const core = window.Live2DCubismCore;
                const latest = core.Version.csmGetLatestMocVersion();
                if (mocVersion > latest) {
                    throw new Error(`moc3 版本 ${mocVersion} 高于当前 Cubism Core 支持的 ${latest}，请更新 Core`);
                }
                this.loadModel(mocBuf, false);
                if (!this._model)
                    throw new Error('CubismMoc 创建模型失败');
                for (let i = 0; i < setting.getExpressionCount(); i++) {
                    const name = setting.getExpressionName(i);
                    const file = setting.getExpressionFileName(i);
                    const buf = await this.assets.fetchBuffer(this.path(file)).catch((e) => {
                        (0, core_2.log)('warn', `表情 ${name} 加载失败：${e.message}`);
                        return null;
                    });
                    if (!buf)
                        continue;
                    const m = this.loadExpression(buf, buf.byteLength, name);
                    if (m)
                        this.expressionsLoaded.set(name, m);
                }
                if (this.expressionsLoaded.size) {
                    this.scheduler.addUpdatableList(new cubismexpressionupdater_1.CubismExpressionUpdater(this._expressionManager));
                }
                if (setting.getPhysicsFileName()) {
                    const buf = await this.assets
                        .fetchBuffer(this.path(setting.getPhysicsFileName()))
                        .catch((e) => {
                        (0, core_2.log)('warn', `物理文件加载失败：${e.message}`);
                        return null;
                    });
                    if (buf) {
                        this.loadPhysics(buf, buf.byteLength);
                        if (this._physics) {
                            this.physicsUpdater = new cubismphysicsupdater_1.CubismPhysicsUpdater(this._physics);
                            this.scheduler.addUpdatableList(this.physicsUpdater);
                        }
                    }
                }
                if (setting.getPoseFileName()) {
                    const buf = await this.assets.fetchBuffer(this.path(setting.getPoseFileName())).catch(() => null);
                    if (buf) {
                        this.loadPose(buf, buf.byteLength);
                        if (this._pose)
                            this.scheduler.addUpdatableList(new cubismposeupdater_1.CubismPoseUpdater(this._pose));
                    }
                }
                if (setting.getUserDataFile()) {
                    const buf = await this.assets.fetchBuffer(this.path(setting.getUserDataFile())).catch(() => null);
                    if (buf)
                        this.loadUserData(buf, buf.byteLength);
                }
                this.caps = this.detectCapabilities(mocVersion);
                for (let i = 0; i < setting.getEyeBlinkParameterCount(); i++) {
                    this.eyeBlinkIds.push(setting.getEyeBlinkParameterId(i));
                }
                if (this.eyeBlinkIds.length) {
                    this._eyeBlink = cubismeyeblink_2.CubismEyeBlink.create(setting);
                    this._eyeBlink.setBlinkingInterval(3.6);
                    this._eyeBlink.setBlinkingSetting(0.09, 0.04, 0.12);
                    this.scheduler.addUpdatableList(new cubismeyeblinkupdater_1.CubismEyeBlinkUpdater(() => this.motionUpdated, this._eyeBlink));
                }
                this._breath = cubismbreath_2.CubismBreath.create();
                const breath = [];
                const addBreath = (id, offset, peak, cycle, weight) => {
                    if (this.hasParam(id))
                        breath.push(new cubismbreath_2.BreathParameterData((0, exports.idOf)(id), offset, peak, cycle, weight));
                };
                addBreath(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamBreath, 0.5, 0.5, 3.2345, 1);
                addBreath(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamBodyAngleY, 0, 1.2, 3.2345, 0.5);
                this._breath.setParameters(breath);
                this.scheduler.addUpdatableList(new cubismbreathupdater_1.CubismBreathUpdater(this._breath));
                for (let i = 0; i < setting.getLipSyncParameterCount(); i++) {
                    this.lipSyncIds.push(setting.getLipSyncParameterId(i));
                }
                if (!this.lipSyncIds.length && this.hasParam(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamMouthOpenY)) {
                    this.lipSyncIds.push((0, exports.idOf)(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamMouthOpenY));
                    (0, core_2.log)('warn', `${this.url} 没有配置 LipSync 组，改用 ParamMouthOpenY`);
                }
                if (this.lipSyncIds.length) {
                    this.lipSyncUpdater = new cubismlipsyncupdater_1.CubismLipSyncUpdater(this.lipSyncIds, null);
                    this.scheduler.addUpdatableList(this.lipSyncUpdater);
                }
                this.look = cubismlook_1.CubismLook.create();
                const lp = [];
                const addLook = (id, x, y, xy) => {
                    if (this.hasParam(id))
                        lp.push(new cubismlook_1.LookParameterData((0, exports.idOf)(id), x, y, xy));
                };
                addLook(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamAngleX, 30, 0, 0);
                addLook(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamAngleY, 0, 30, 0);
                addLook(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamAngleZ, 0, 0, -30);
                addLook(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamBodyAngleX, 10, 0, 0);
                addLook(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamEyeBallX, 1, 0, 0);
                addLook(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamEyeBallY, 0, 1, 0);
                this.look.setParameters(lp);
                this.scheduler.addUpdatableList(new cubismlookupdater_1.CubismLookUpdater(this.look, this._dragManager));
                const layout = new Map();
                setting.getLayoutMap(layout);
                this._modelMatrix.setupFromLayout(layout);
                this._model.saveParameters();
                for (let g = 0; g < setting.getMotionGroupCount(); g++) {
                    const group = setting.getMotionGroupName(g);
                    for (let i = 0; i < setting.getMotionCount(group); i++) {
                        const file = setting.getMotionFileName(group, i);
                        const buf = await this.assets.fetchBuffer(this.path(file)).catch((e) => {
                            (0, core_2.log)('warn', `动作 ${group}_${i} 加载失败：${e.message}`);
                            return null;
                        });
                        if (!buf)
                            continue;
                        const m = this.loadMotion(buf, buf.byteLength, `${group}_${i}`, null, null, setting, group, i);
                        if (m) {
                            m.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
                            this.motionsLoaded.set(`${group}_${i}`, m);
                        }
                    }
                }
                this.idleGroup = this.findGroup(['Idle', 'idle', 'IDLE']) || '';
                this._motionManager.stopAllMotions();
                this.createRenderer(width, height);
                const renderer = this.getRenderer();
                renderer.startUp(gl);
                renderer.setIsPremultipliedAlpha(true);
                for (let i = 0; i < setting.getTextureCount(); i++) {
                    const file = setting.getTextureFileName(i);
                    if (!file)
                        continue;
                    const tex = await this.assets.createTexture(gl, this.path(file));
                    this.textures.push(tex);
                    renderer.bindTexture(i, tex);
                }
                renderer.loadShaders(this.shaderPath);
                await this.waitShaders(gl);
                this.scheduler.sortUpdatableList();
                this.finalizeCaps();
                this.setInitialized(true);
                this.ready = true;
            }
            catch (e) {
                this.release();
                throw e;
            }
        }
        waitShaders(gl, timeoutMs = 15000) {
            const shader = cubismshader_webgl_2.CubismShaderManager_WebGL.getInstance().getShader(gl);
            if (!shader)
                return Promise.reject(new Error('着色器管理器没有初始化'));
            const t0 = performance.now();
            return new Promise((resolve, reject) => {
                const poll = () => {
                    if (this.released)
                        return reject(new Error('模型已释放'));
                    if (shader._isShaderLoaded)
                        return resolve();
                    if (!shader._isShaderLoading) {
                        return reject(new Error(`着色器加载失败，请检查 ${this.shaderPath} 下的 .vert/.frag 文件是否可访问`));
                    }
                    if (performance.now() - t0 > timeoutMs)
                        return reject(new Error(`着色器加载超时（${this.shaderPath}）`));
                    setTimeout(poll, 16);
                };
                poll();
            });
        }
        detectCapabilities(mocVersion) {
            const m = this._model;
            const params = new Map();
            for (let i = 0; i < m.getParameterCount(); i++) {
                const id = idStr(m.getParameterId(i));
                params.set(id, {
                    id,
                    min: m.getParameterMinimumValue(i),
                    max: m.getParameterMaximumValue(i),
                    def: m.getParameterDefaultValue(i)
                });
            }
            const parts = [];
            for (let i = 0; i < m.getPartCount(); i++)
                parts.push(idStr(m.getPartId(i)));
            const s = this.setting;
            const motionGroups = {};
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
        finalizeCaps() {
            if (!this.caps)
                return;
            this.caps.expressions = [...this.expressionsLoaded.keys()];
            this.caps.eyeBlinkIds = this.eyeBlinkIds.map(idStr);
            this.caps.lipSyncIds = this.lipSyncIds.map(idStr);
        }
        hasPart(id) {
            return !!this.caps && this.caps.parts.includes(id);
        }
        posePartIds() {
            var _a;
            if (this.posePartCache)
                return this.posePartCache;
            const out = new Set();
            const groups = ((_a = this._pose) === null || _a === void 0 ? void 0 : _a._partGroups) || [];
            for (const g of groups)
                if (g && g.partId)
                    out.add(idStr(g.partId));
            this.posePartCache = out;
            return out;
        }
        setPartOpacity(id, v) {
            if (!this.hasPart(id))
                return;
            if (this.posePartIds().has(id))
                this._model.setParameterValueById((0, exports.idOf)(id), v);
            else
                this._model.setPartOpacityById((0, exports.idOf)(id), v);
        }
        getPartOpacity(id) {
            if (!this.hasPart(id))
                return 0;
            if (this.posePartIds().has(id))
                return this._model.getParameterValueById((0, exports.idOf)(id));
            return this._model.getPartOpacityById((0, exports.idOf)(id));
        }
        getPartRenderOpacity(id) {
            return this.hasPart(id) ? this._model.getPartOpacityById((0, exports.idOf)(id)) : 0;
        }
        hasParam(id) {
            if (this.caps)
                return this.caps.params.has(id);
            const m = this._model;
            if (!m)
                return false;
            for (let i = 0; i < m.getParameterCount(); i++)
                if (idStr(m.getParameterId(i)) === id)
                    return true;
            return false;
        }
        findGroup(names) {
            if (!this.setting)
                return null;
            const all = [];
            for (let g = 0; g < this.setting.getMotionGroupCount(); g++)
                all.push(this.setting.getMotionGroupName(g));
            for (const n of names) {
                const hit = all.find((a) => a.toLowerCase() === n.toLowerCase());
                if (hit)
                    return hit;
            }
            return null;
        }
        addUpdater(u) {
            this.scheduler.addUpdatableList(u);
            this.scheduler.sortUpdatableList();
        }
        setAudioProvider(p) {
            var _a;
            (_a = this.lipSyncUpdater) === null || _a === void 0 ? void 0 : _a.setAudioProvider(p);
        }
        hasLipSync() {
            return !!this.lipSyncUpdater;
        }
        setLookTarget(x, y) {
            var _a;
            (_a = this._dragManager) === null || _a === void 0 ? void 0 : _a.set(x, y);
        }
        setPhysicsEnabled(on) {
            if (!this.physicsUpdater || !this._physics)
                return false;
            if (on === this.physicsOn)
                return true;
            if (on) {
                this._physics.stabilization(this._model);
                this.scheduler.addUpdatableList(this.physicsUpdater);
                this.scheduler.sortUpdatableList();
            }
            else {
                this.scheduler.removeUpdatableList(this.physicsUpdater);
            }
            this.physicsOn = on;
            return true;
        }
        isPhysicsEnabled() {
            return !!this.physicsUpdater && this.physicsOn;
        }
        expressionNames() {
            return [...this.expressionsLoaded.keys()];
        }
        setExpressionByName(name) {
            const m = this.expressionsLoaded.get(name);
            if (!m)
                return false;
            this._expressionManager.startMotion(m, false);
            return true;
        }
        clearExpression() {
            const mgr = this._expressionManager;
            const entries = mgr.getCubismMotionQueueEntries ? mgr.getCubismMotionQueueEntries() : [];
            for (const e of entries)
                if (e && e.setFadeOut)
                    e.setFadeOut(0.4);
        }
        motionNames() {
            return [...this.motionsLoaded.keys()];
        }
        startMotionByName(name, priority) {
            let key = name;
            if (!this.motionsLoaded.has(key)) {
                const n = this.setting ? this.setting.getMotionCount(name) : 0;
                if (n > 0)
                    key = `${name}_${Math.floor(Math.random() * n)}`;
            }
            const motion = this.motionsLoaded.get(key);
            if (!motion)
                return Promise.resolve(false);
            if (priority === exports.Priority.Force)
                this._motionManager.setReservePriority(priority);
            else if (!this._motionManager.reserveMotion(priority))
                return Promise.resolve(false);
            return new Promise((resolve) => {
                const h = this._motionManager.startMotionPriority(motion, false, priority);
                if (h === cubismmotionqueuemanager_3.InvalidMotionQueueEntryHandleValue) {
                    resolve(false);
                    return;
                }
                this.currentMotion = key;
                this.pendingMotions.push({ h, key, resolve });
            });
        }
        stopMotions() {
            var _a;
            (_a = this._motionManager) === null || _a === void 0 ? void 0 : _a.stopAllMotions();
            for (const p of this.pendingMotions)
                p.resolve(true);
            this.pendingMotions = [];
            this.currentMotion = '';
        }
        getParam(id) {
            return this._model.getParameterValueById((0, exports.idOf)(id));
        }
        setParam(id, v, weight = 1) {
            this._model.setParameterValueById((0, exports.idOf)(id), v, weight);
        }
        addParam(id, v, weight = 1) {
            this._model.addParameterValueById((0, exports.idOf)(id), v, weight);
        }
        update(dt) {
            if (!this.ready || this.released)
                return;
            this._model.loadParameters();
            this.motionUpdated = false;
            if (this._motionManager.isFinished()) {
                this.currentMotion = '';
                if (this.autoIdleMotion && this.idleGroup) {
                    const n = this.setting.getMotionCount(this.idleGroup);
                    if (n > 0)
                        void this.startMotionByName(`${this.idleGroup}_${Math.floor(Math.random() * n)}`, exports.Priority.Idle);
                }
            }
            else {
                this.motionUpdated = this._motionManager.updateMotion(this._model, dt);
            }
            this._model.saveParameters();
            if (this.pendingMotions.length) {
                this.pendingMotions = this.pendingMotions.filter((p) => {
                    if (!this._motionManager.isFinishedByHandle(p.h))
                        return true;
                    if (this.currentMotion === p.key)
                        this.currentMotion = '';
                    p.resolve(true);
                    return false;
                });
            }
            this.scheduler.onLateUpdate(this._model, dt);
            this._model.update();
        }
        draw(projection, fbo, viewport) {
            if (!this.ready || this.released)
                return;
            projection.multiplyByMatrix(this._modelMatrix);
            const r = this.getRenderer();
            r.setMvpMatrix(projection);
            r.setRenderState(fbo, viewport);
            r.drawModel(this.shaderPath);
        }
        getModelMatrixRef() {
            return this._modelMatrix;
        }
        release() {
            var _a;
            if (this.released)
                return;
            this.released = true;
            this.ready = false;
            for (const p of this.pendingMotions)
                p.resolve(false);
            this.pendingMotions = [];
            try {
                (_a = this._motionManager) === null || _a === void 0 ? void 0 : _a.stopAllMotions();
                this.motionsLoaded.forEach((m) => acubismmotion_4.ACubismMotion.delete(m));
                this.motionsLoaded.clear();
                this.expressionsLoaded.forEach((m) => acubismmotion_4.ACubismMotion.delete(m));
                this.expressionsLoaded.clear();
                if (this.look)
                    cubismlook_1.CubismLook.delete(this.look);
                this.look = null;
                this.scheduler.release();
                if (this.gl)
                    for (const t of this.textures)
                        this.gl.deleteTexture(t);
                this.textures = [];
                super.release();
            }
            catch (e) {
                (0, core_2.log)('warn', `释放模型时出错：${e.message}`);
            }
            this.gl = null;
        }
    }
    exports.Live2DModel = Live2DModel;
});
define("src/canvas", ["require", "exports", "framework/src/math/cubismmatrix44", "framework/src/rendering/cubismshader_webgl", "src/assets", "src/core", "src/model"], function (require, exports, cubismmatrix44_5, cubismshader_webgl_3, assets_1, core_3, model_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DCanvas = void 0;
    class Live2DCanvas {
        constructor(target, opts = {}) {
            var _a, _b, _c, _d, _e;
            this.gl = null;
            this.slots = [];
            this.raf = 0;
            this.last = 0;
            this.acc = 0;
            this.frames = 0;
            this.fpsT = 0;
            this.ro = null;
            this.io = null;
            this.visibleInViewport = true;
            this.running = false;
            this.destroyed = false;
            this.onVis = () => this.kick();
            this.onLost = (e) => this.handleLost(e);
            this.onRestored = () => void this.handleRestored();
            this.onRestore = null;
            this.opts = {
                maxFps: (_a = opts.maxFps) !== null && _a !== void 0 ? _a : 60,
                maxDpr: (_b = opts.maxDpr) !== null && _b !== void 0 ? _b : 2,
                pauseOffscreen: (_c = opts.pauseOffscreen) !== null && _c !== void 0 ? _c : true,
                shaderPath: (_d = opts.shaderPath) !== null && _d !== void 0 ? _d : 'live2d/shaders/WebGL/',
                antialias: (_e = opts.antialias) !== null && _e !== void 0 ? _e : true,
                coreUrls: opts.coreUrls
            };
            this.assets = opts.assets || assets_1.sharedAssets;
            if (target instanceof HTMLCanvasElement)
                this.canvas = target;
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
        initGl() {
            const attrs = {
                alpha: true,
                premultipliedAlpha: true,
                antialias: this.opts.antialias,
                preserveDrawingBuffer: false,
                powerPreference: 'default'
            };
            const g2 = this.canvas.getContext('webgl2', attrs);
            if (g2) {
                this.gl = g2;
                this.stats.webgl = 2;
            }
            else {
                const g1 = (this.canvas.getContext('webgl', attrs) ||
                    this.canvas.getContext('experimental-webgl', attrs));
                this.gl = g1;
                this.stats.webgl = g1 ? 1 : 0;
            }
            if (!this.gl)
                throw new Error('当前浏览器不支持 WebGL，无法显示 Live2D');
        }
        async addModel(url, transform = {}, loadOpts = {}) {
            if (this.destroyed)
                throw new Error('画布已销毁');
            await (0, core_3.loadCore)(this.opts.coreUrls);
            const gl = this.gl;
            if (!gl || gl.isContextLost())
                throw new Error('WebGL 上下文不可用');
            const model = new model_1.Live2DModel(url, this.assets);
            const opts = { shaderPath: this.opts.shaderPath, ...loadOpts };
            await model.load(gl, this.canvas.width || 1, this.canvas.height || 1, opts);
            if (this.destroyed) {
                model.release();
                throw new Error('画布已销毁');
            }
            const slot = {
                model,
                url,
                transform: { x: 0, y: 0, scale: 1, ...transform },
                visible: true,
                loadOpts: opts
            };
            this.slots.push(slot);
            this.stats.models = this.slots.length;
            (0, core_3.log)('info', `模型已加载：${url}`);
            this.start();
            return slot;
        }
        removeModel(slot) {
            const i = this.slots.indexOf(slot);
            if (i < 0)
                return;
            this.slots.splice(i, 1);
            slot.model.release();
            this.stats.models = this.slots.length;
            if (!this.slots.length)
                this.clear();
        }
        setTransform(slot, t) {
            for (const k of ['x', 'y', 'scale']) {
                const v = t[k];
                if (v === undefined)
                    continue;
                if (!Number.isFinite(v))
                    throw new Error(`${k} 必须是有限数字`);
                if (k === 'scale' && (v <= 0 || v > 20))
                    throw new Error('scale 必须在 (0, 20] 之间');
                slot.transform[k] = v;
            }
        }
        toLook(clientX, clientY) {
            const r = this.canvas.getBoundingClientRect();
            const x = ((clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
            const y = -(((clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
            return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
        }
        resize() {
            if (this.destroyed)
                return;
            const dpr = Math.min(this.opts.maxDpr, window.devicePixelRatio || 1);
            const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
            const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
            if (w === this.canvas.width && h === this.canvas.height)
                return;
            this.canvas.width = w;
            this.canvas.height = h;
            this.stats.width = w;
            this.stats.height = h;
            for (const s of this.slots)
                s.model.setRenderTargetSize(w, h);
            this.kick();
        }
        shouldRun() {
            return (this.running &&
                !this.destroyed &&
                !document.hidden &&
                (!this.opts.pauseOffscreen || this.visibleInViewport) &&
                !!this.gl &&
                !this.gl.isContextLost());
        }
        start() {
            this.running = true;
            this.kick();
        }
        stop() {
            this.running = false;
            cancelAnimationFrame(this.raf);
            this.raf = 0;
            this.stats.paused = true;
        }
        kick() {
            if (!this.shouldRun()) {
                this.stats.paused = true;
                return;
            }
            if (this.raf)
                return;
            this.stats.paused = false;
            this.last = performance.now();
            this.raf = requestAnimationFrame((t) => this.frame(t));
        }
        frame(now) {
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
        clear() {
            const gl = this.gl;
            if (!gl || gl.isContextLost())
                return;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        render(dt) {
            var _a;
            const gl = this.gl;
            if (!gl || gl.isContextLost())
                return;
            this.clear();
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            const w = this.canvas.width;
            const h = this.canvas.height;
            for (const s of this.slots) {
                if (!s.model.ready)
                    continue;
                try {
                    (_a = s.beforeUpdate) === null || _a === void 0 ? void 0 : _a.call(s, dt);
                    s.model.update(dt);
                    if (!s.visible)
                        continue;
                    const proj = new cubismmatrix44_5.CubismMatrix44();
                    if (w > h)
                        proj.scale(h / w, 1);
                    else
                        proj.scale(1, w / h);
                    const tr = new cubismmatrix44_5.CubismMatrix44();
                    tr.translateRelative(s.transform.x, s.transform.y);
                    const sc = new cubismmatrix44_5.CubismMatrix44();
                    sc.scaleRelative(s.transform.scale, s.transform.scale);
                    proj.multiplyByMatrix(tr);
                    proj.multiplyByMatrix(sc);
                    s.model.draw(proj, null, [0, 0, w, h]);
                }
                catch (e) {
                    (0, core_3.log)('error', `渲染 ${s.url} 出错：${e.message}`);
                    s.visible = false;
                }
            }
        }
        getStats() {
            return { ...this.stats, contextLost: !!this.gl && this.gl.isContextLost() };
        }
        handleLost(e) {
            e.preventDefault();
            (0, core_3.log)('warn', 'WebGL 上下文丢失，等待恢复');
            cancelAnimationFrame(this.raf);
            this.raf = 0;
            for (const s of this.slots)
                s.model.release();
        }
        async handleRestored() {
            var _a;
            (0, core_3.log)('info', 'WebGL 上下文已恢复，重新加载模型');
            const old = this.slots.splice(0);
            for (const s of old) {
                try {
                    const n = await this.addModel(s.url, s.transform, s.loadOpts);
                    n.beforeUpdate = s.beforeUpdate;
                    n.visible = s.visible;
                    (_a = this.onRestore) === null || _a === void 0 ? void 0 : _a.call(this, s, n);
                }
                catch (err) {
                    (0, core_3.log)('error', `恢复 ${s.url} 失败：${err.message}`);
                }
            }
        }
        destroy() {
            var _a, _b, _c;
            if (this.destroyed)
                return;
            this.destroyed = true;
            this.stop();
            for (const s of this.slots.splice(0))
                s.model.release();
            (_a = this.ro) === null || _a === void 0 ? void 0 : _a.disconnect();
            (_b = this.io) === null || _b === void 0 ? void 0 : _b.disconnect();
            document.removeEventListener('visibilitychange', this.onVis);
            this.canvas.removeEventListener('webglcontextlost', this.onLost);
            this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
            const gl = this.gl;
            if (gl) {
                try {
                    const mgr = cubismshader_webgl_3.CubismShaderManager_WebGL.getInstance();
                    const map = mgr._shaderMap;
                    const sh = map === null || map === void 0 ? void 0 : map.get(gl);
                    if (sh) {
                        sh.release();
                        map.delete(gl);
                    }
                }
                catch (e) {
                }
                (_c = gl.getExtension('WEBGL_lose_context')) === null || _c === void 0 ? void 0 : _c.loseContext();
            }
            this.gl = null;
            if (this.canvas.classList.contains('l2d-canvas'))
                this.canvas.remove();
        }
    }
    exports.Live2DCanvas = Live2DCanvas;
});
define("src/controller", ["require", "exports", "framework/src/motion/icubismupdater", "src/animation", "src/audio", "src/canvas", "src/core", "src/model"], function (require, exports, icubismupdater_9, animation_2, audio_2, canvas_1, core_4, model_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Live2DController = void 0;
    const CONTROLLER_ORDER = 450;
    class ModelTarget {
        constructor(m) {
            this.m = m;
        }
        has(id) {
            return this.m.hasParam(id);
        }
        range(id) {
            var _a;
            const p = (_a = this.m.caps) === null || _a === void 0 ? void 0 : _a.params.get(id);
            return p ? { min: p.min, max: p.max, def: p.def } : null;
        }
        hasPart(id) {
            return this.m.hasPart(id);
        }
        setPart(id, v) {
            this.m.setPartOpacity(id, v);
        }
        getPart(id) {
            return this.m.getPartOpacity(id);
        }
        model() {
            return this.m.getModel();
        }
        add(id, v, w = 1) {
            this.model().addParameterValueById((0, model_2.idOf)(id), v, w);
        }
        set(id, v, w = 1) {
            this.model().setParameterValueById((0, model_2.idOf)(id), v, w);
        }
        mul(id, v, w = 1) {
            this.model().multiplyParameterValueById((0, model_2.idOf)(id), v, w);
        }
        get(id) {
            return this.model().getParameterValueById((0, model_2.idOf)(id));
        }
    }
    class AnimationUpdater extends icubismupdater_9.ICubismUpdater {
        constructor(core, audio) {
            super(CONTROLLER_ORDER);
            this.core = core;
            this.audio = audio;
        }
        onLateUpdate(_model, dt) {
            this.core.mouth = this.audio.getParameter();
            this.core.apply(dt);
        }
    }
    const num = (name, v) => {
        if (typeof v !== 'number' || !Number.isFinite(v))
            throw new TypeError(`${name} 必须是有限数字`);
        return v;
    };
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    class Live2DController {
        constructor(target, canvasOpts = {}) {
            this.audio = new audio_2.Live2DAudioSync();
            this.config = null;
            this.slot = null;
            this.anim = null;
            this.destroyed = false;
            this.manualSpeaking = false;
            this.loading = null;
            if (target instanceof canvas_1.Live2DCanvas) {
                this.canvas = target;
                this.ownsCanvas = false;
            }
            else {
                this.canvas = new canvas_1.Live2DCanvas(target, canvasOpts);
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
        get model() {
            return this.slot ? this.slot.model : null;
        }
        get ready() {
            return !!this.slot && this.slot.model.ready;
        }
        need() {
            if (this.destroyed)
                throw new Error('控制器已销毁');
            const m = this.model;
            if (!m || !m.ready)
                throw new Error('模型还没加载完成');
            return m;
        }
        async loadModel(modelPath, cfg = {}) {
            if (typeof modelPath !== 'string' || !/\.model3\.json(\?.*)?$/i.test(modelPath)) {
                throw new TypeError('modelPath 必须是 .model3.json 文件路径');
            }
            if (this.destroyed)
                throw new Error('控制器已销毁');
            const run = async () => {
                var _a, _b, _c;
                this.unload();
                const config = { id: cfg.id || modelPath, ...cfg, model: modelPath };
                const slot = await this.canvas.addModel(modelPath, {
                    x: (_a = config.x) !== null && _a !== void 0 ? _a : 0,
                    y: (_b = config.y) !== null && _b !== void 0 ? _b : 0,
                    scale: (_c = config.scale) !== null && _c !== void 0 ? _c : 1
                });
                if (this.destroyed) {
                    this.canvas.removeModel(slot);
                    return;
                }
                this.config = config;
                this.slot = slot;
                this.attach();
                const missing = (config.params || []).filter((p) => !slot.model.hasParam(p));
                if (missing.length)
                    (0, core_4.log)('warn', `${config.id} 缺少参数：${missing.join(', ')}`);
            };
            this.loading = run();
            try {
                await this.loading;
            }
            finally {
                this.loading = null;
            }
        }
        attach() {
            var _a;
            const slot = this.slot;
            const cfg = this.config;
            if (!slot || !cfg)
                return;
            const m = slot.model;
            const a = cfg.audio || {};
            for (const k of ['attack', 'release', 'floorDb', 'ceilDb', 'gate']) {
                if (typeof a[k] === 'number')
                    this.audio.env[k] = a[k];
            }
            m.setAudioProvider(this.audio);
            m.autoIdleMotion = !cfg.disableIdleMotion;
            if ((_a = cfg.motions) === null || _a === void 0 ? void 0 : _a.idle) {
                const g = cfg.motions.idle.replace(/_\d+$/, '');
                if (m.findGroup([g]))
                    m.idleGroup = m.findGroup([g]);
            }
            const opts = {
                expressions: cfg.expressions,
                motions: cfg.motions,
                wave: cfg.wave,
                idleScale: cfg.idleScale
            };
            const prev = this.anim;
            this.anim = new animation_2.AnimationCore(new ModelTarget(m), opts);
            if (prev) {
                this.anim.idle = prev.idle;
                this.anim.setEmotion(prev.emotion, this.emotionExpression(prev.emotion) !== null);
                prev.destroy();
            }
            m.addUpdater(new AnimationUpdater(this.anim, this.audio));
        }
        unload() {
            var _a;
            this.audio.stop();
            (_a = this.anim) === null || _a === void 0 ? void 0 : _a.destroy();
            this.anim = null;
            if (this.slot)
                this.canvas.removeModel(this.slot);
            this.slot = null;
            this.config = null;
        }
        syncSpeaking() {
            if (this.anim)
                this.anim.speaking = this.manualSpeaking || this.audio.speaking;
        }
        emotionExpression(e) {
            var _a, _b;
            const m = this.model;
            if (!m)
                return null;
            const mapped = (_b = (_a = this.config) === null || _a === void 0 ? void 0 : _a.expressions) === null || _b === void 0 ? void 0 : _b[e];
            if (mapped && m.expressionNames().includes(mapped))
                return mapped;
            const same = m.expressionNames().find((n) => n.toLowerCase() === e);
            return same || null;
        }
        setExpression(name) {
            if (typeof name !== 'string' || !name)
                throw new TypeError('表情名必须是非空字符串');
            const m = this.need();
            if (animation_2.EMOTIONS.includes(name))
                return this.setEmotion(name);
            if (!m.setExpressionByName(name)) {
                return { ok: false, reason: `模型没有表情「${name}」，可用：${m.expressionNames().join('、') || '无'}` };
            }
            return { ok: true, via: 'expression' };
        }
        setEmotion(e) {
            if (!animation_2.EMOTIONS.includes(e))
                throw new TypeError(`未知情绪 ${e}，可用：${animation_2.EMOTIONS.join(', ')}`);
            const m = this.need();
            const exp = this.emotionExpression(e);
            if (exp)
                m.setExpressionByName(exp);
            else
                m.clearExpression();
            this.anim.setEmotion(e, !!exp);
            const caps = this.anim.capabilities();
            const viaParams = caps.emotionParams.includes(e) || e === 'neutral';
            if (!exp && !viaParams)
                return { ok: false, reason: `模型既没有「${e}」表情，也没有可用的面部/头部参数` };
            return { ok: true, via: exp ? 'expression' : 'parameters' };
        }
        get emotion() {
            return this.anim ? this.anim.emotion : 'neutral';
        }
        async playMotion(name, priority = model_2.Priority.Normal) {
            if (typeof name !== 'string' || !name)
                throw new TypeError('动作名必须是非空字符串');
            const m = this.need();
            const groups = m.caps ? Object.keys(m.caps.motionGroups) : [];
            const exists = m.motionNames().includes(name) || groups.includes(name);
            if (!exists)
                return { ok: false, reason: `模型没有动作「${name}」，可用组：${groups.join('、') || '无'}` };
            const started = m.startMotionByName(name, priority);
            const ok = await started;
            return ok ? { ok: true, via: 'motion', result: 'done' } : { ok: false, reason: '优先级更高的动作正在播放' };
        }
        async interact(name, priority = model_2.Priority.Normal) {
            var _a, _b, _c;
            if (!animation_2.INTERACTIONS.includes(name))
                throw new TypeError(`未知动作 ${name}，可用：${animation_2.INTERACTIONS.join(', ')}`);
            const m = this.need();
            const anim = this.anim;
            const mapped = (_b = (_a = this.config) === null || _a === void 0 ? void 0 : _a.motions) === null || _b === void 0 ? void 0 : _b[name];
            if (mapped) {
                const r = await this.playMotion(mapped, priority);
                if (r.ok || name === 'wave')
                    return r;
            }
            if (name === 'wave') {
                const w = (_c = this.config) === null || _c === void 0 ? void 0 : _c.wave;
                if (w === null || w === void 0 ? void 0 : w.motion)
                    return this.playMotion(w.motion, priority);
                if ((w === null || w === void 0 ? void 0 : w.param) || (w === null || w === void 0 ? void 0 : w.swing)) {
                    const chk = anim.checkWave(w);
                    if (!chk.ok)
                        return { ok: false, reason: `挥手配置里这些参数/部件模型没有：${chk.missing.join('、')}` };
                    const p = anim.startWaveParam(w, priority);
                    if (!p)
                        return { ok: false, reason: '优先级更高的动作正在执行' };
                    return { ok: true, via: 'parameters', result: await p };
                }
                return { ok: false, reason: '这个模型没有配置挥手（需要在角色配置里给 wave.motion 或 wave.param）' };
            }
            const caps = anim.capabilities();
            if (!caps.head)
                return { ok: false, reason: '模型没有头部角度参数（ParamAngleX/Y/Z）' };
            const p = anim.startInteraction(name, priority);
            if (!p)
                return { ok: false, reason: '优先级更高的动作正在执行' };
            return { ok: true, via: 'parameters', result: await p };
        }
        setHeadAngle(x, y, z) {
            num('x', x);
            num('y', y);
            num('z', z);
            const m = this.need();
            if (!m.hasParam(animation_2.P.angleX) && !m.hasParam(animation_2.P.angleY) && !m.hasParam(animation_2.P.angleZ)) {
                return { ok: false, reason: '模型没有头部角度参数' };
            }
            const lim = (id, v) => {
                var _a;
                const i = (_a = m.caps) === null || _a === void 0 ? void 0 : _a.params.get(id);
                return i ? clamp(v, i.min, i.max) : v;
            };
            this.anim.setHead(lim(animation_2.P.angleX, x), lim(animation_2.P.angleY, y), lim(animation_2.P.angleZ, z));
            return { ok: true, via: 'parameters' };
        }
        setWaveConfig(w) {
            if (!w || typeof w !== 'object')
                throw new TypeError('wave 配置必须是对象');
            this.need();
            if (!this.config)
                throw new Error('模型还没加载完成');
            const chk = this.anim.checkWave(w);
            this.config.wave = w;
            this.anim.opts.wave = w;
            return chk.ok || w.motion ? { ok: true } : { ok: false, reason: `模型没有：${chk.missing.join('、')}` };
        }
        setParameter(id, value) {
            const m = this.need();
            if (!m.hasParam(id))
                return { ok: false, reason: `模型没有参数 ${id}` };
            if (value !== null) {
                num('value', value);
                const r = m.caps.params.get(id);
                value = clamp(value, r.min, r.max);
            }
            this.anim.overrideParam(id, value);
            return { ok: true, via: 'parameters' };
        }
        setPartOpacity(id, value) {
            const m = this.need();
            if (!m.hasPart(id))
                return { ok: false, reason: `模型没有部件 ${id}` };
            if (value !== null)
                value = clamp(num('value', value), 0, 1);
            this.anim.overridePart(id, value);
            return { ok: true };
        }
        getParts() {
            const m = this.model;
            if (!m || !m.ready || !m.caps)
                return [];
            return m.caps.parts.map((id) => ({ id, opacity: m.getPartRenderOpacity(id), pose: m.posePartIds().has(id) }));
        }
        clearHeadAngle() {
            var _a;
            (_a = this.anim) === null || _a === void 0 ? void 0 : _a.clearHead();
        }
        setEyeOpen(value) {
            const m = this.need();
            if (value === null) {
                this.anim.setEye(null);
                return { ok: true };
            }
            num('value', value);
            if (!m.hasParam(animation_2.P.eyeLOpen) && !m.hasParam(animation_2.P.eyeROpen))
                return { ok: false, reason: '模型没有眼睛开合参数' };
            this.anim.setEye(clamp(value, 0, 1));
            return { ok: true, via: 'parameters' };
        }
        setMouthOpen(value) {
            const m = this.need();
            if (!m.hasLipSync())
                return { ok: false, reason: '模型没有口型参数（LipSync 组或 ParamMouthOpenY）' };
            if (value === null) {
                this.audio.manual(null);
                return { ok: true };
            }
            num('value', value);
            this.audio.manual(clamp(value, 0, 1));
            return { ok: true, via: 'parameters' };
        }
        startSpeaking(opts = {}) {
            var _a, _b;
            const m = this.need();
            this.manualSpeaking = true;
            let via = 'none';
            if (opts.audio)
                via = this.audio.attach(opts.audio, opts.text || '', opts.duration || 0);
            else if (opts.text) {
                this.audio.estimate(opts.text, opts.duration && opts.duration > 0 ? opts.duration : opts.text.length * 0.22);
                via = 'estimate';
            }
            this.syncSpeaking();
            const sp = (_b = (_a = this.config) === null || _a === void 0 ? void 0 : _a.motions) === null || _b === void 0 ? void 0 : _b.speak;
            if (sp)
                void m.startMotionByName(sp, model_2.Priority.Normal);
            if (!m.hasLipSync())
                return { ok: false, reason: '模型没有口型参数，只能做说话时的头部动作' };
            return { ok: true, via: 'parameters', reason: via === 'audio' ? '实时音频分析' : via === 'estimate' ? '按文字估算' : undefined };
        }
        stopSpeaking() {
            this.manualSpeaking = false;
            this.audio.stop();
            this.syncSpeaking();
        }
        startIdle() {
            var _a;
            if (this.anim)
                this.anim.idle = true;
            if (this.model)
                this.model.autoIdleMotion = !((_a = this.config) === null || _a === void 0 ? void 0 : _a.disableIdleMotion);
        }
        stopIdle() {
            if (this.anim)
                this.anim.idle = false;
            if (this.model)
                this.model.autoIdleMotion = false;
        }
        setPhysics(on) {
            const m = this.need();
            if (!m.setPhysicsEnabled(!!on))
                return { ok: false, reason: '模型没有物理文件（physics3.json）' };
            return { ok: true };
        }
        setLookTarget(x, y) {
            num('x', x);
            num('y', y);
            this.need().setLookTarget(clamp(x, -1, 1), clamp(y, -1, 1));
        }
        setTransform(t) {
            if (!this.slot)
                throw new Error('模型还没加载完成');
            this.canvas.setTransform(this.slot, t);
        }
        show() {
            if (this.slot)
                this.slot.visible = true;
        }
        hide() {
            if (this.slot)
                this.slot.visible = false;
        }
        getParameters() {
            const m = this.model;
            if (!m || !m.ready || !m.caps)
                return [];
            return [...m.caps.params.values()].map((p) => ({ ...p, value: m.getParam(p.id) }));
        }
        capabilities() {
            const m = this.model;
            if (!m || !m.caps)
                return {};
            return {
                ...this.anim.capabilities(),
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
        destroy() {
            var _a;
            if (this.destroyed)
                return;
            this.destroyed = true;
            this.audio.destroy();
            (_a = this.anim) === null || _a === void 0 ? void 0 : _a.destroy();
            this.anim = null;
            if (this.slot && !this.ownsCanvas)
                this.canvas.removeModel(this.slot);
            this.slot = null;
            if (this.ownsCanvas)
                this.canvas.destroy();
        }
    }
    exports.Live2DController = Live2DController;
});
define("src/registry", ["require", "exports", "src/controller", "src/core", "src/assets"], function (require, exports, controller_1, core_5, assets_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.registry = exports.Live2DRegistry = void 0;
    class Live2DRegistry {
        constructor() {
            this.entries = new Map();
            this.maxActive = 6;
            this.canvasOpts = {};
        }
        register(cfg) {
            if (!cfg || typeof cfg.id !== 'string' || !cfg.id)
                throw new TypeError('角色配置缺少 id');
            if (typeof cfg.model !== 'string' || !/\.model3\.json(\?.*)?$/i.test(cfg.model)) {
                throw new TypeError(`角色 ${cfg.id} 的 model 必须是 .model3.json 路径`);
            }
            const old = this.entries.get(cfg.id);
            if (old && old.cfg.model !== cfg.model)
                this.unmount(cfg.id);
            this.entries.set(cfg.id, { cfg, ctrl: old && old.cfg.model === cfg.model ? old.ctrl : null, loading: null, lastUsed: 0 });
        }
        unregister(id) {
            this.unmount(id);
            this.entries.delete(id);
        }
        has(id) {
            return this.entries.has(id);
        }
        list() {
            return [...this.entries.values()].map((e) => e.cfg);
        }
        get(id) {
            var _a;
            return ((_a = this.entries.get(id)) === null || _a === void 0 ? void 0 : _a.ctrl) || null;
        }
        async mount(id, container) {
            const e = this.entries.get(id);
            if (!e)
                throw new Error(`没有注册角色 ${id}`);
            e.lastUsed = performance.now();
            if (e.ctrl) {
                if (e.ctrl.canvas.canvas.parentElement !== container)
                    container.appendChild(e.ctrl.canvas.canvas);
                e.ctrl.show();
                e.ctrl.canvas.start();
                return e.ctrl;
            }
            if (e.loading) {
                const c = await e.loading;
                if (c.canvas.canvas.parentElement !== container)
                    container.appendChild(c.canvas.canvas);
                return c;
            }
            this.evict(id);
            e.loading = (async () => {
                const ctrl = new controller_1.Live2DController(container, this.canvasOpts);
                try {
                    await ctrl.loadModel(e.cfg.model, e.cfg);
                }
                catch (err) {
                    ctrl.destroy();
                    throw err;
                }
                e.ctrl = ctrl;
                return ctrl;
            })();
            try {
                return await e.loading;
            }
            finally {
                e.loading = null;
            }
        }
        show(id) {
            var _a;
            (_a = this.get(id)) === null || _a === void 0 ? void 0 : _a.show();
        }
        hide(id) {
            var _a;
            (_a = this.get(id)) === null || _a === void 0 ? void 0 : _a.hide();
        }
        unmount(id) {
            const e = this.entries.get(id);
            if (!e || !e.ctrl)
                return;
            e.ctrl.destroy();
            e.ctrl = null;
            assets_2.sharedAssets.evict(e.cfg.model.slice(0, e.cfg.model.lastIndexOf('/') + 1));
            (0, core_5.log)('info', `已释放角色 ${id}`);
        }
        retain(keep) {
            for (const id of this.entries.keys())
                if (!keep.includes(id))
                    this.unmount(id);
        }
        evict(except) {
            const live = [...this.entries.entries()].filter(([, e]) => e.ctrl);
            if (live.length < this.maxActive)
                return;
            const cands = live
                .filter(([id, e]) => id !== except && !(e.ctrl.canvas.canvas.isConnected))
                .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
            const victim = cands[0] || live.filter(([id]) => id !== except).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
            if (victim)
                this.unmount(victim[0]);
        }
        activeCount() {
            return [...this.entries.values()].filter((e) => e.ctrl).length;
        }
        destroyAll() {
            for (const id of this.entries.keys())
                this.unmount(id);
        }
    }
    exports.Live2DRegistry = Live2DRegistry;
    exports.registry = new Live2DRegistry();
});
define("src/index", ["require", "exports", "src/assets", "src/canvas", "src/controller", "src/core", "src/model", "src/registry"], function (require, exports, assets_3, canvas_2, controller_2, core_6, model_3, registry_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = {
        loadCore: core_6.loadCore,
        coreLoaded: core_6.coreLoaded,
        Live2DCanvas: canvas_2.Live2DCanvas,
        Live2DController: controller_2.Live2DController,
        Live2DModel: model_3.Live2DModel,
        Live2DAssetManager: assets_3.Live2DAssetManager,
        Live2DRegistry: registry_1.Live2DRegistry,
        registry: registry_1.registry,
        assets: assets_3.sharedAssets,
        Priority: model_3.Priority
    };
});

  req("src/entry");
})();
