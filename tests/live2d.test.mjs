// 运行：node --test tests/*.test.mjs
// 加载打包后的 static/live2d/live2d.js，测试不依赖 Cubism Core / WebGL 的部分：
// 打包加载器、口型平滑、文字估算口型、动画管理器（优先级、打断、能力检测、参数写入）。
// 真实模型渲染需要官方 Cubism Core，在浏览器里用 static/live2d.html 验证。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadBundle() {
  const ctx = {
    console,
    performance,
    setTimeout,
    clearTimeout,
    URL,
    TextDecoder,
    CustomEvent: class CustomEvent { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    document: {
      createElement: () => ({ getContext: () => null, remove() {} }),
      // 模拟脚本 404
      head: { appendChild(el) { setTimeout(() => el.onerror && el.onerror()); } },
      addEventListener() {},
    },
    location: { href: 'http://localhost/', origin: 'http://localhost' },
  };
  ctx.window = ctx;
  ctx.dispatchEvent = () => true;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../static/live2d/live2d.js', import.meta.url), 'utf8'), ctx);
  return ctx.Live2D;
}

const L = loadBundle();

/** 记录写入的假参数表（只用来测试动画逻辑，不是 Live2D 模型） */
function fakeTarget(ids) {
  const vals = new Map(ids.map((i) => [i, 0]));
  const writes = [];
  return {
    vals,
    writes,
    has: (id) => vals.has(id),
    add: (id, v, w = 1) => { writes.push(['add', id]); vals.set(id, vals.get(id) + v * w); },
    set: (id, v, w = 1) => { writes.push(['set', id]); vals.set(id, vals.get(id) * (1 - w) + v * w); },
    mul: (id, v, w = 1) => { writes.push(['mul', id]); vals.set(id, vals.get(id) * (1 + (v - 1) * w)); },
    get: (id) => vals.get(id),
    reset() { for (const k of vals.keys()) vals.set(k, 0); writes.length = 0; },
  };
}

test('bundle 暴露完整 API', () => {
  for (const k of ['loadCore', 'webglSupport', 'Live2DAudioSync', 'AnimationCore', 'MouthEnvelope', 'unlockAudio']) {
    assert.ok(L[k], `缺少 ${k}`);
  }
  // 依赖官方 Framework 的部分要等 Cubism Core 加载后才出现
  assert.equal(L.Live2DController, undefined);
  assert.equal(L.coreLoaded(), false);
  assert.deepEqual([...L.EMOTIONS], ['neutral', 'happy', 'angry', 'sad', 'surprised', 'thinking', 'shy', 'confident']);
  assert.deepEqual([...L.INTERACTIONS], ['nod', 'shake', 'lowerHead', 'tilt', 'wave']);
});

test('口型：无声闭嘴、小声微张、大声张大，并且平滑', () => {
  const e = new L.MouthEnvelope();
  assert.equal(e.levelFromRms(0), 0);
  assert.equal(e.levelFromRms(0.001), 0, '噪声门以下应闭嘴');
  const small = e.levelFromRms(0.01), big = e.levelFromRms(0.2);
  assert.ok(small > 0 && small < 0.5, `小音量 ${small}`);
  assert.ok(big > 0.9, `大音量 ${big}`);
  e.target = 1;
  const v1 = e.step(1 / 60);
  assert.ok(v1 > 0 && v1 < 0.5, '一帧内不会直接跳到最大');
  for (let i = 0; i < 30; i++) e.step(1 / 60);
  assert.ok(e.value > 0.95);
  e.target = 0;
  for (let i = 0; i < 60; i++) e.step(1 / 60);
  assert.equal(e.value, 0, '目标为 0 时最终完全闭合');
});

test('口型：高频抖动的输入被抑制', () => {
  const e = new L.MouthEnvelope();
  let maxJump = 0, prev = 0;
  for (let i = 0; i < 240; i++) {
    e.target = i % 2 ? 1 : 0; // 每帧交替的最坏情况
    const v = e.step(1 / 60);
    maxJump = Math.max(maxJump, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(maxJump < 0.32, `单帧变化 ${maxJump.toFixed(3)} 过大`);
});

test('文字估算口型：标点处闭嘴，时长外为 0', () => {
  assert.equal(L.estimateMouth('你好。', 3, 2.5), 0);
  assert.equal(L.estimateMouth('你好', 1, 1.5), 0);
  assert.ok(L.estimateMouth('你好', 1, 0.25) > 0.3);
});

test('AudioSync：手动口型、停止后闭嘴', () => {
  const a = new L.Live2DAudioSync();
  a.manual(0.8);
  for (let i = 0; i < 30; i++) a.update(1 / 60);
  assert.ok(a.getParameter() > 0.75);
  a.manual(null);
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  assert.equal(a.getParameter(), 0);
  assert.equal(a.source, 'none');
});

const STD = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
  'ParamEyeBallX', 'ParamEyeBallY', 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamMouthForm', 'ParamCheek', 'ParamBrowLY', 'ParamBrowRY'];

function run(core, t, seconds, dt = 1 / 60) {
  for (let i = 0; i < seconds / dt; i++) { t.reset(); core.apply(dt); }
}

test('待机：头部有自然小幅运动，不越界，不重复', () => {
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const t = fakeTarget(STD);
  const core = new L.AnimationCore(t, { random: rnd });
  const xs = [];
  for (let i = 0; i < 60 * 20; i++) { t.reset(); core.apply(1 / 60); xs.push(t.vals.get('ParamAngleX')); }
  const max = Math.max(...xs.map(Math.abs));
  assert.ok(max > 2 && max < 16, `待机幅度 ${max}`);
  let maxStep = 0;
  for (let i = 1; i < xs.length; i++) maxStep = Math.max(maxStep, Math.abs(xs[i] - xs[i - 1]));
  assert.ok(maxStep < 0.6, `单帧变化 ${maxStep} 太大会显得抖`);
  // 前 10 秒和后 10 秒不应相同（不是固定循环）
  const a = xs.slice(0, 600), b = xs.slice(600);
  const diff = a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
  assert.ok(diff > 1);
  core.idle = false;
  run(core, t, 3);
  assert.ok(Math.abs(t.vals.get('ParamAngleX')) < 0.3, '关闭待机后回到中间');
});

test('只写模型存在的参数', () => {
  const t = fakeTarget(['ParamAngleX']);
  const core = new L.AnimationCore(t);
  core.setEmotion('happy', false);
  run(core, t, 1);
  for (const [, id] of t.writes) assert.equal(id, 'ParamAngleX');
  const caps = core.capabilities();
  assert.equal(caps.head, true);
  assert.equal(caps.eyeOpen, false);
  assert.equal(caps.wave, false, '没有手臂参数也没配置动作时不能挥手');
});

test('互动动作：优先级、打断、完成', async () => {
  const t = fakeTarget(STD);
  const core = new L.AnimationCore(t);
  core.idle = false;
  const p1 = core.startInteraction('nod', 2);
  assert.ok(p1);
  assert.equal(core.startInteraction('shake', 1), null, '低优先级不能打断');
  const p2 = core.startInteraction('shake', 3);
  assert.equal(await p1, 'interrupted');
  let minX = 0, maxX = 0;
  for (let i = 0; i < 90; i++) { t.reset(); core.apply(1 / 60); const x = t.vals.get('ParamAngleX'); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  assert.equal(await p2, 'done');
  assert.ok(maxX > 5 && minX < -5, `摇头幅度 ${minX}~${maxX}`);
  assert.equal(core.interaction, null);
});

test('点头：ParamAngleY 先向下', () => {
  const t = fakeTarget(STD);
  const core = new L.AnimationCore(t);
  core.idle = false;
  core.startInteraction('nod', 2);
  let minY = 0;
  for (let i = 0; i < 30; i++) { t.reset(); core.apply(1 / 60); minY = Math.min(minY, t.vals.get('ParamAngleY')); }
  assert.ok(minY < -5, `点头幅度 ${minY}`);
});

test('情绪：平滑过渡；有表情文件时不再叠加面部参数', () => {
  const t = fakeTarget(STD);
  const core = new L.AnimationCore(t);
  core.idle = false;
  core.setEmotion('sad', false);
  t.reset(); core.apply(1 / 60);
  const first = t.vals.get('ParamAngleY');
  run(core, t, 2);
  const settled = t.vals.get('ParamAngleY');
  assert.ok(settled < -8, `难过时低头 ${settled}`);
  assert.ok(Math.abs(first) < Math.abs(settled) / 3, '不是瞬间切换');
  assert.ok(t.vals.get('ParamMouthForm') < -0.5, '没有表情文件时用嘴形参数');
  core.setEmotion('sad', true);
  run(core, t, 2);
  assert.ok(Math.abs(t.vals.get('ParamMouthForm')) < 0.05, '有表情文件时交给表情');
});

test('手动覆盖头部和眼睛，释放后恢复', () => {
  const t = fakeTarget(STD);
  const core = new L.AnimationCore(t);
  core.idle = false;
  core.setHead(20, -10, 5);
  run(core, t, 1.5);
  assert.ok(Math.abs(t.vals.get('ParamAngleX') - 20) < 1);
  core.clearHead();
  run(core, t, 1.5);
  assert.ok(Math.abs(t.vals.get('ParamAngleX')) < 1);
  core.setEye(0.2);
  run(core, t, 1);
  assert.ok(t.writes.some(([k, id]) => k === 'set' && id === 'ParamEyeLOpen'));
});

test('挥手：只在模型有对应参数时执行', async () => {
  const t = fakeTarget([...STD, 'ParamArmRA']);
  const core = new L.AnimationCore(t, { wave: { param: 'ParamArmRA', from: 0, to: 10 } });
  assert.equal(core.capabilities().wave, true);
  assert.equal(core.startWaveParam({ param: 'ParamArmXX' }, 2), null);
  const p = core.startWaveParam({ param: 'ParamArmRA', from: 0, to: 10 }, 2);
  let max = 0;
  for (let i = 0; i < 130; i++) { t.reset(); core.apply(1 / 60); max = Math.max(max, t.vals.get('ParamArmRA')); }
  assert.equal(await p, 'done');
  assert.ok(max > 6);
});

test('没有 Cubism Core 时给出明确错误，不会崩溃', async () => {
  await assert.rejects(L.loadCore(['missing/core.js']), /没有找到 Live2D Cubism Core.*static\/live2d\/core/);
  assert.equal(L.Live2DController, undefined);
});
