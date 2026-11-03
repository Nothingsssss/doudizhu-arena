/* 特效引擎：Canvas 粒子 + 镜头（震屏/推镜/色散）+ DOM 特效 + 合成背景音乐
 * URL 参数：?fx=0~3 特效强度（默认 3 = 拉满）；?bgm=0 关闭背景音乐
 */
(() => {
"use strict";
const Q = new URLSearchParams(location.search);
const LV = (() => { const v = parseInt(Q.get("fx") ?? "3", 10); return isNaN(v) ? 3 : Math.max(0, Math.min(3, v)); })();
const AMT = [0, 0.35, 0.7, 1][LV];
const W = 1920, H = 1080;
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const R = (v) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);
const cnt = (k) => Math.round(k * AMT);

/* ================= 粒子 ================= */
let cv = null, cx = null, parts = [], last = 0, running = false;
function add(p) {
  if (!cx || parts.length >= 3500) return;
  p.max = p.life; parts.push(p);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
}
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  cx.clearRect(0, 0, W, H);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); if (p.die) p.die(p); continue; }
    step(p, dt); draw(p);
  }
  cx.globalCompositeOperation = "source-over"; cx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else { running = false; cx.clearRect(0, 0, W, H); }
}
function step(p, dt) {
  if (p.drag) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
  if (p.g) p.vy += p.g * dt;
  p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
  if (p.vr) { p.r += p.vr * dt; if (p.vd) p.vr *= Math.pow(p.vd, dt * 60); }
  if (p.spin) p.rot += p.spin * dt;
  if (p.grow) p.size += p.grow * dt;
  if (p.tick) p.tick(p, dt);
}
function draw(p) {
  const a = Math.max(0, p.life / p.max);
  switch (p.t) {
    case "spark":
      cx.globalCompositeOperation = "lighter"; cx.globalAlpha = a;
      cx.strokeStyle = p.c; cx.lineWidth = p.w * (0.4 + 0.6 * a); cx.lineCap = "round";
      cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len); cx.stroke();
      break;
    case "dot":
      cx.globalCompositeOperation = "lighter"; cx.globalAlpha = a * (p.flick && Math.random() < 0.4 ? 0.25 : 1);
      cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, Math.max(0.5, p.size * (0.5 + 0.5 * a)), 0, 6.283); cx.fill();
      break;
    case "ring":
      cx.globalCompositeOperation = "lighter"; cx.globalAlpha = a;
      cx.strokeStyle = p.c; cx.lineWidth = Math.max(0.5, p.w * a);
      cx.beginPath(); cx.arc(p.x, p.y, Math.max(1, p.r), 0, 6.283); cx.stroke();
      break;
    case "smoke": {
      cx.globalCompositeOperation = "source-over"; cx.globalAlpha = a * p.o;
      const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, p.c); g.addColorStop(1, "rgba(0,0,0,0)");
      cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, p.size, 0, 6.283); cx.fill();
      break;
    }
    case "glow": {
      cx.globalCompositeOperation = "lighter"; cx.globalAlpha = a;
      const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, p.c); g.addColorStop(1, "rgba(0,0,0,0)");
      cx.fillStyle = g; cx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      break;
    }
    case "rect":
      cx.globalCompositeOperation = "source-over"; cx.globalAlpha = Math.min(1, a * 2.5);
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
      if (p.flip) cx.scale(1, Math.cos(p.rot * 2.3));
      cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
      break;
  }
}

/* ================= 发射器 ================= */
function burst(x, y, o = {}) {
  const cs = o.colors || ["#fff"];
  for (let k = 0; k < cnt(o.n ?? 60); k++) {
    const ang = o.dir != null ? o.dir + rnd(-(o.spread ?? 1) / 2, (o.spread ?? 1) / 2) : rnd(0, 6.283);
    const sp = R(o.speed || [300, 1000]);
    add({ t: "spark", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: o.g ?? 500, drag: o.drag ?? 0.92,
      len: R(o.len || [0.02, 0.05]), w: R(o.w || [2, 4]), c: pick(cs), life: R(o.life || [0.5, 1.1]) });
  }
}
function glitter(x, y, o = {}) {
  const cs = o.colors || ["#fff"];
  for (let k = 0; k < cnt(o.n ?? 40); k++) {
    const ang = rnd(0, 6.283), sp = R(o.speed || [60, 500]);
    add({ t: "dot", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: o.g ?? 160, drag: 0.93,
      size: R(o.size || [1.5, 3.5]), c: pick(cs), life: R(o.life || [1, 2]), flick: true });
  }
}
function embers(x, y, o = {}) {
  const cs = o.colors || ["#ffb020", "#ff5a1f"], r = o.r ?? 100;
  for (let k = 0; k < cnt(o.n ?? 40); k++) {
    add({ t: "dot", x: x + rnd(-r, r), y: y + rnd(-r / 2, r / 2), vx: rnd(-90, 90), vy: rnd(-320, -60), g: -30, drag: 0.97,
      size: R([2, 5]), c: pick(cs), life: R([1, 2.4]), flick: true });
  }
}
function ring(x, y, o = {}) {
  if (!LV) return;
  add({ t: "ring", x, y, r: o.r ?? 10, vr: o.vr ?? 1500, vd: o.vd ?? 0.93, w: o.w ?? 16, c: o.c ?? "#fff", life: o.life ?? 0.55 });
}
function glow(x, y, o = {}) {
  if (!LV) return;
  add({ t: "glow", x, y, size: o.size ?? 400, c: o.c ?? "rgba(255,255,255,1)", life: o.life ?? 0.4 });
}
function smoke(x, y, o = {}) {
  for (let k = 0; k < cnt(o.n ?? 20); k++) {
    add({ t: "smoke", x: x + rnd(-60, 60), y: y + rnd(-40, 40), vx: rnd(-160, 160), vy: rnd(-180, 40), drag: 0.95,
      size: R([40, 90]), grow: R([60, 160]), c: o.c ?? "rgba(80,60,60,1)", o: R([0.25, 0.5]), life: R([1.2, 2.4]) });
  }
}
function debris(x, y, o = {}) {
  const cs = o.colors || ["#ffffff", "#e9ecf5", "#ff4d6d", "#1b1e2e"];
  for (let k = 0; k < cnt(o.n ?? 30); k++) {
    add({ t: "rect", x, y, vx: rnd(-1000, 1000), vy: rnd(-1300, -200), g: 2000, drag: 0.985,
      w: R([8, 22]), h: R([10, 30]), rot: rnd(0, 6), spin: rnd(-16, 16), c: pick(cs), life: R([1, 1.8]) });
  }
}
const CONFETTI = ["#ff3d6e", "#ffcf3d", "#3dffb4", "#3dc8ff", "#b93dff", "#ffffff", "#ff8a3d"];
function confetti(x, y, o = {}) {
  const cs = o.colors || CONFETTI;
  for (let k = 0; k < cnt(o.n ?? 120); k++) {
    const ang = (o.dir ?? -1.57) + rnd(-(o.spread ?? 0.8) / 2, (o.spread ?? 0.8) / 2), sp = R(o.speed || [900, 2000]);
    add({ t: "rect", flip: true, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 900, drag: 0.94,
      w: R([8, 14]), h: R([12, 22]), rot: rnd(0, 6), spin: rnd(-12, 12), c: pick(cs), life: R([2.2, 3.8]) });
  }
}
function rain(o = {}) {
  const cs = o.colors || CONFETTI;
  for (let k = 0; k < cnt(o.n ?? 120); k++) {
    add({ t: "rect", flip: true, x: rnd(0, W), y: rnd(-300, -20), vx: rnd(-80, 80), vy: rnd(150, 400), g: 120, drag: 0.99,
      w: R([8, 14]), h: R([12, 20]), rot: rnd(0, 6), spin: rnd(-8, 8), c: pick(cs), life: R([3, 5]) });
  }
}
function firework(x, y, colors) {
  glow(x, y, { size: 280, c: "rgba(255,240,210,.9)", life: 0.35 });
  burst(x, y, { n: 150, colors, speed: [200, 800], g: 280, drag: 0.94, len: [0.03, 0.06], w: [2, 3.5], life: [0.9, 1.7] });
  glitter(x, y, { n: 70, colors: colors.concat("#fff"), speed: [80, 600], g: 120, life: [1.2, 2.2] });
  ring(x, y, { c: colors[0], vr: 1000, w: 6, life: 0.5 });
}
// 拖尾飞行物（火箭、流星），到达终点时调用 boom
function shell(x0, y0, x1, y1, dur, colors, boom, o = {}) {
  if (!cx) { if (boom) boom(x1, y1); return; }
  add({ t: "dot", x: x0, y: y0, vx: (x1 - x0) / dur, vy: (y1 - y0) / dur, size: o.size ?? 8, c: "#fff", life: dur,
    tick: (p) => {
      if (Math.random() > AMT) return;
      for (let k = 0; k < (o.thick ?? 2); k++) {
        add({ t: "dot", x: p.x + rnd(-5, 5), y: p.y + rnd(-5, 5), vx: rnd(-60, 60) - p.vx * 0.05, vy: rnd(-60, 60) - p.vy * 0.05 + (o.fall ?? 60),
          size: R([2, 5]), c: pick(colors), life: R([0.3, 0.8]), flick: true, drag: 0.95 });
      }
    },
    die: () => boom && boom(x1, y1) });
}

/* ================= 镜头 ================= */
const cam = { tr: 0, z: 0, run: false, el: null };
function shake(a) { if (!LV || !cam.el) return; cam.tr = Math.min(1.5, cam.tr + a * (0.4 + 0.6 * AMT)); camGo(); }
function punch(z) { if (!LV || !cam.el) return; cam.z += z * (0.4 + 0.6 * AMT); camGo(); }
function camGo() {
  if (cam.run) return;
  cam.run = true;
  let lt = performance.now();
  const f = (t) => {
    const dt = Math.min(0.1, (t - lt) / 1000); lt = t;
    cam.tr = Math.max(0, cam.tr - dt * 1.4);
    cam.z *= Math.pow(0.003, dt);
    const s = cam.tr * cam.tr;
    if (s < 0.0004 && Math.abs(cam.z) < 0.0008) { cam.el.style.transform = ""; cam.run = false; cam.z = 0; return; }
    const x = (Math.random() * 2 - 1) * 48 * s, y = (Math.random() * 2 - 1) * 32 * s, r = (Math.random() * 2 - 1) * 1.8 * s;
    cam.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${(1 + cam.z).toFixed(4)})`;
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

/* ================= DOM 特效 ================= */
function dom(cls, style, ms, html = "") {
  const e = document.createElement("div");
  e.className = cls; if (style) e.style.cssText = style; e.innerHTML = html;
  $("fx").appendChild(e); setTimeout(() => e.remove(), ms);
  return e;
}
function restartClass(el, cls, ms) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  clearTimeout(el["_t_" + cls]); el["_t_" + cls] = setTimeout(() => el.classList.remove(cls), ms);
}
function flash(bg, ms = 600) { if (LV) dom("flash", `background:${bg};animation-duration:${ms}ms`, ms + 50); }
function rgb(ms = 500) { if (LV >= 2) restartClass($("cam"), "rgb", ms); }
function speed(ms = 1200, color = "rgba(255,255,255,.55)") { if (LV) dom("speedlines", `animation-duration:${ms}ms;--sl:${color}`, ms); }
function bgHit(cls, ms = 900) { if (LV) restartClass($("bg"), cls, ms); }
function bolt(x, y, color = "#bfe8ff") {
  if (!LV) return;
  const mk = () => {
    const pts = []; let px = x + rnd(-260, 260), py = -30;
    const N = 14;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      pts.push(`${(px + (x - px) * u + (k && k < N ? rnd(-55, 55) : 0)).toFixed(0)},${(py + (y - py) * u).toFixed(0)}`);
    }
    return pts.join(" ");
  };
  const a = mk(), b = mk();
  dom("bolt", "", 700, `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <polyline points="${a}" stroke="${color}" stroke-width="26" opacity=".35" fill="none" stroke-linejoin="round"/>
    <polyline points="${a}" stroke="#fff" stroke-width="7" fill="none" stroke-linejoin="round"/>
    <polyline points="${b}" stroke="${color}" stroke-width="3" opacity=".8" fill="none"/></svg>`);
}
function rays(x, y, color = "#ffd36b", ms = 2400) { if (LV) dom("rays", `left:${x}px;top:${y}px;--rc:${color};animation-duration:${ms}ms`, ms); }
function beam(x, y, color = "#3ee7ff", ms = 1500) { if (LV) dom("beam", `left:${x}px;height:${y + 80}px;--rc:${color};animation-duration:${ms}ms`, ms); }
// 文字沿弧线飞到目标位置
function fly(html, from, to, ms, cls, onEnd) {
  const e = dom("flytext " + (cls || ""), `left:${from.x}px;top:${from.y}px`, ms + 200, html);
  const t0 = performance.now(), cxp = (from.x + to.x) / 2, cyp = Math.min(from.y, to.y) - 260;
  let trailT = 0;
  const f = (t) => {
    const u = Math.min(1, (t - t0) / ms), e2 = u * u * (3 - 2 * u);
    const x = (1 - e2) * (1 - e2) * from.x + 2 * (1 - e2) * e2 * cxp + e2 * e2 * to.x;
    const y = (1 - e2) * (1 - e2) * from.y + 2 * (1 - e2) * e2 * cyp + e2 * e2 * to.y;
    const sc = u < 0.2 ? 0.6 + u * 4 : 1.4 - (u - 0.2) * 1.1;
    e.style.left = x + "px"; e.style.top = y + "px"; e.style.transform = `translate(-50%,-50%) scale(${sc.toFixed(3)})`;
    if (t - trailT > 16) { trailT = t; glitter(x, y, { n: 3, colors: ["#ffd36b", "#fff"], speed: [20, 120], g: 60, life: [0.4, 0.8] }); }
    if (u < 1) requestAnimationFrame(f); else { e.remove(); if (onEnd) onEnd(); }
  };
  requestAnimationFrame(f);
}
// 飞机横穿屏幕
const PLANE = `<svg viewBox="0 0 240 120"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fe9ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
  <path d="M10 60 L60 52 L150 50 C190 50 225 55 232 60 C225 65 190 70 150 70 L60 68 Z" fill="url(#pg)"/>
  <path d="M110 52 L70 6 L92 6 L150 51 Z M110 68 L70 114 L92 114 L150 69 Z" fill="#cfefff"/>
  <path d="M30 55 L14 28 L28 28 L52 54 Z M30 65 L14 92 L28 92 L52 66 Z" fill="#cfefff"/>
  <path d="M190 54 L214 56 L214 60 L190 60 Z" fill="#3d7bff"/></svg>`;
function plane(ms = 1500, onMid) {
  if (!LV) { if (onMid) onMid(); return; }
  const e = dom("planefx", "", ms + 100, PLANE);
  const t0 = performance.now(); let mid = false, lt = 0;
  const f = (t) => {
    const u = Math.min(1, (t - t0) / ms);
    const x = -300 + u * 2300, y = 700 - u * 420 + Math.sin(u * 7) * 26;
    const ang = (-420 / 2300 + Math.cos(u * 7) * 7 * 26 / 2300) * 57.3;
    e.style.transform = `translate(${x - 120}px,${y - 60}px) rotate(${ang.toFixed(2)}deg)`;
    if (t - lt > 14) {
      lt = t;
      for (const dy of [-40, 40]) add({ t: "dot", x: x - 40, y: y + dy * 0.9, vx: rnd(-80, -20), vy: rnd(-20, 20), size: R([3, 6]), c: pick(["#ffffff", "#9fe9ff", "#3ee7ff"]), life: R([0.6, 1.1]), drag: 0.96 });
      add({ t: "spark", x: x - 110, y, vx: rnd(-900, -500), vy: rnd(-80, 80), g: 0, drag: 0.95, len: 0.05, w: 3, c: pick(["#ffb020", "#ff5a1f", "#fff"]), life: R([0.2, 0.4]) });
    }
    if (!mid && u > 0.42) { mid = true; if (onMid) onMid(x, y); }
    if (u < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
// 元素中心在舞台坐标系的位置
function at(el) {
  const st = $("stage").getBoundingClientRect(), k = st.width / W || 1;
  if (!el) return { x: W / 2, y: H / 2 };
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - st.left) / k, y: (r.top + r.height / 2 - st.top) / k };
}
function beat() { if (LV) restartClass($("stage"), "beat", 300); }

/* ================= 音频 ================= */
let AC = null, SFXG = null, BG = null;
function ctx() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 8; comp.connect(AC.destination);
      SFXG = AC.createGain(); SFXG.gain.value = 1; SFXG.connect(comp);
      BG = AC.createGain(); BG.gain.value = 0.3; BG.connect(comp);
    } catch (e) { AC = null; return null; }
  }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function sfxOut() { ctx(); return SFXG; }

const BGM = { on: Q.get("bgm") !== "0" && localStorage.getItem("dd_bgm") !== "off", danger: false, timer: null, step: 0, next: 0 };
const ROOTS = [110, 87.31, 130.81, 98];            // A F C G
const CHORD = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12]];
const BASS = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
let NB = null;
function nbuf() {
  if (!NB) { NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return NB;
}
function env(g, t, v, dur) { g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function bKick(t) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
  env(g, t, 0.95, 0.28); o.connect(g).connect(BG); o.start(t); o.stop(t + 0.3);
}
function bNoise(t, dur, v, type, f) {
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = nbuf(); fl.type = type; fl.frequency.value = f; env(g, t, v, dur);
  s.connect(fl).connect(g).connect(BG); s.start(t, Math.random() * 0.5, dur + 0.05);
}
function bTone(t, f, dur, type, v, lp) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = f; env(g, t, v, dur);
  if (lp) {
    const fl = AC.createBiquadFilter(); fl.type = "lowpass"; fl.Q.value = 6;
    fl.frequency.setValueAtTime(lp * 3, t); fl.frequency.exponentialRampToValueAtTime(lp, t + dur);
    o.connect(fl).connect(g);
  } else o.connect(g);
  g.connect(BG); o.start(t); o.stop(t + dur + 0.02);
}
function playStep(s, t) {
  const bar = (s >> 4) & 3, i = s & 15, root = ROOTS[bar], hot = BGM.danger;
  if (i % 4 === 0) { bKick(t); setTimeout(beat, Math.max(0, (t - AC.currentTime) * 1000)); }
  if (hot && (i === 7 || i === 14)) bKick(t);
  if (i === 4 || i === 12) { bNoise(t, 0.18, 0.4, "highpass", 1400); bTone(t, 190, 0.08, "triangle", 0.18); }
  if (hot) bNoise(t, 0.04, i % 2 ? 0.06 : 0.11, "highpass", 7500);
  else if (i % 4 === 2) bNoise(t, 0.05, 0.1, "highpass", 7500);
  if (BASS[i]) bTone(t, root * (i % 8 === 6 ? 2 : 1), 0.14, "sawtooth", 0.3, 260);
  if (hot || (bar >= 2 && i % 2 === 0)) {
    const ch = CHORD[bar];
    bTone(t, root * (hot ? 8 : 4) * Math.pow(2, ch[i % 4] / 12), 0.09, "square", hot ? 0.05 : 0.03);
  }
  if (hot && i === 0 && bar === 0) bNoise(t, 0.8, 0.12, "bandpass", 2000);   // 冲击音
}
function sched() {
  if (!AC) return;
  const spb = 60 / (BGM.danger ? 150 : 124) / 4;
  while (BGM.next < AC.currentTime + 0.15) {
    if (BGM.next < AC.currentTime - 0.2) BGM.next = AC.currentTime + 0.02;   // 标签页挂起后不要补播
    playStep(BGM.step % 64, BGM.next); BGM.next += spb; BGM.step++;
  }
}
function bgmStart() {
  if (!BGM.on || BGM.timer) return;
  const c = ctx(); if (!c) return;
  BGM.next = c.currentTime + 0.08; BGM.timer = setInterval(sched, 25);
}
function bgmStop() { clearInterval(BGM.timer); BGM.timer = null; }
function bgmToggle() {
  BGM.on = !BGM.on; localStorage.setItem("dd_bgm", BGM.on ? "on" : "off");
  BGM.on ? bgmStart() : bgmStop();
  return BGM.on;
}
function danger(on) {
  on = !!on;
  if (BGM.danger === on) return;
  BGM.danger = on;
  $("stage").classList.toggle("danger", on);
}

function init() {
  cv = $("fxc"); cx = cv && LV ? cv.getContext("2d") : null;
  cam.el = $("cam");
  document.addEventListener("pointerdown", () => { ctx(); bgmStart(); }, { once: true });
}

window.FX = { LV, AMT, rnd, pick, init, burst, glitter, embers, ring, glow, smoke, debris, confetti, rain, firework, shell,
  shake, punch, flash, rgb, speed, bgHit, bolt, rays, beam, fly, plane, at, beat, danger,
  ctx, sfxOut, BGM, bgmStart, bgmStop, bgmToggle };
})();
