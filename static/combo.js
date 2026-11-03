/* 牌型动画：每种牌型一个对应的画面
 *   飞机      卡通客机从左下飞到右上，拉白色尾迹
 *   王炸      火箭在牌上点火、冒烟、起飞，升空后炸成烟花
 *   炸弹      黑色炸弹从天上掉到牌上，引线烧完爆炸（全场唯一会震屏的）
 *   顺子      牌一张接一张亮起跳起，下面画出一道金色箭头
 *   连对      两张一组翻转跳起，下面画出两道粉紫箭头
 *   三带一/二  三个金环依次落到三张同点数的牌上
 *   四带二    红色印章「四带二」盖在牌旁边
 *   单张/对子  牌面闪光；2 和王有金色光芒
 * 依赖 fx.js 的粒子；画面本身不动（不震屏），只有炸弹爆炸时 FX.thump 一下。
 */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const E = {
  inQ: (u) => u * u, inC: (u) => u * u * u, outQ: (u) => 1 - (1 - u) * (1 - u),
  outBack: (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
};

/* ---------- 素材 ---------- */
const PLANE = `<svg width="300" height="132" viewBox="0 0 320 140">
<defs>
  <linearGradient id="cpF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eef2f8"/><stop offset="1" stop-color="#a7b3c8"/></linearGradient>
  <linearGradient id="cpR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a4a"/><stop offset="1" stop-color="#b4121e"/></linearGradient>
  <linearGradient id="cpW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#ffc23a"/><stop offset="1" stop-color="#c47a10"/></linearGradient>
  <linearGradient id="cpG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f6ff"/><stop offset="1" stop-color="#2a8cff"/></linearGradient>
</defs>
<path d="M150 60 L120 16 L142 14 L198 58 Z" fill="#c9d2e0" stroke="#6a7590" stroke-width="2"/>
<path d="M36 64 L16 10 L44 10 L86 58 Z" fill="url(#cpR)" stroke="#6a0810" stroke-width="2.5" stroke-linejoin="round"/>
<text x="44" y="46" font-size="20" font-weight="900" fill="#ffe08a" font-family="KaiTi, STKaiti, serif" transform="rotate(-8 44 40)">斗</text>
<path d="M28 70 C28 54 58 50 110 50 L250 50 C286 50 310 60 314 72 C310 84 286 92 250 92 L110 92 C58 92 28 86 28 70 Z" fill="url(#cpF)" stroke="#4a5570" stroke-width="2.5"/>
<path d="M36 76 L304 76 C300 82 292 86 280 86 L62 86 C48 86 40 82 36 76 Z" fill="url(#cpR)"/>
<path d="M36 72 L306 72" stroke="#ffd25a" stroke-width="3"/>
<g fill="url(#cpG)" stroke="#1a3a80" stroke-width="1.5">${[120, 140, 160, 180, 200, 220, 240].map((x) => `<rect x="${x}" y="58" width="11" height="9" rx="4"/>`).join("")}</g>
<path d="M262 56 C284 56 300 62 306 68 L268 68 Z" fill="url(#cpG)" stroke="#1a3a80" stroke-width="2"/>
<path d="M48 74 L18 94 L40 96 L80 78 Z" fill="#dfe6f0" stroke="#4a5570" stroke-width="2"/>
<rect x="130" y="94" width="46" height="18" rx="9" fill="#6a7590" stroke="#3a4258" stroke-width="2"/><ellipse cx="176" cy="103" rx="4" ry="8" fill="#2a2e40"/>
<path d="M136 82 L98 132 L126 134 L204 84 Z" fill="url(#cpW)" stroke="#8a4a08" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`;

const ROCKET = `<svg width="96" height="208" viewBox="0 0 120 260">
<defs>
  <linearGradient id="crB" x1="0" x2="1"><stop offset="0" stop-color="#9aa6be"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".65" stop-color="#e6ebf3"/><stop offset="1" stop-color="#7a86a0"/></linearGradient>
  <linearGradient id="crR" x1="0" x2="1"><stop offset="0" stop-color="#7a0810"/><stop offset=".4" stop-color="#ff4a3a"/><stop offset="1" stop-color="#7a0810"/></linearGradient>
  <linearGradient id="crG" x1="0" x2="1"><stop offset="0" stop-color="#8a4a08"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#8a4a08"/></linearGradient>
  <radialGradient id="crW" cx=".38" cy=".35"><stop offset="0" stop-color="#d9fbff"/><stop offset=".55" stop-color="#2a8cff"/><stop offset="1" stop-color="#0a2a6a"/></radialGradient>
</defs>
<path d="M32 148 L4 212 L4 234 L36 208 Z" fill="url(#crR)" stroke="#4a0408" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M88 148 L116 212 L116 234 L84 208 Z" fill="url(#crR)" stroke="#4a0408" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M60 6 C90 40 93 92 90 150 L88 214 L32 214 L30 150 C27 92 30 40 60 6 Z" fill="url(#crB)" stroke="#4a5570" stroke-width="2.5"/>
<path d="M60 6 C76 24 85 44 88 62 L32 62 C35 44 44 24 60 6 Z" fill="url(#crR)" stroke="#4a0408" stroke-width="2.5"/>
<rect x="30" y="60" width="60" height="9" fill="url(#crG)"/>
<circle cx="60" cy="102" r="18" fill="url(#crW)" stroke="url(#crG)" stroke-width="7"/><circle cx="53" cy="95" r="5" fill="#fff" opacity=".85"/>
<rect x="30" y="160" width="60" height="9" fill="url(#crG)"/>
<text x="60" y="198" font-size="26" font-weight="900" text-anchor="middle" fill="#c4121e" font-family="KaiTi, STKaiti, serif">王</text>
<path d="M55 186 L65 186 L65 238 L55 238 Z" fill="url(#crR)" stroke="#4a0408" stroke-width="1.5"/>
<path d="M40 214 L80 214 L87 232 L33 232 Z" fill="#4a5068" stroke="#23263a" stroke-width="2.5"/>
</svg>`;
const FLAME = `<div class="flame"><svg viewBox="0 0 60 150" preserveAspectRatio="none">
<defs><linearGradient id="cfO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".25" stop-color="#ffc23a"/><stop offset=".6" stop-color="#ff5a1f" stop-opacity=".85"/><stop offset="1" stop-color="#ff2d2d" stop-opacity="0"/></linearGradient>
<linearGradient id="cfI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bff6ff" stop-opacity=".9"/><stop offset="1" stop-color="#3ee7ff" stop-opacity="0"/></linearGradient></defs>
<path d="M30 0 C54 26 58 78 30 150 C2 78 6 26 30 0 Z" fill="url(#cfO)"/><path d="M30 4 C42 24 44 56 30 92 C16 56 18 24 30 4 Z" fill="url(#cfI)"/></svg></div>`;

const BOMB = `<svg width="150" height="168" viewBox="0 0 160 180">
<defs>
  <radialGradient id="cbB" cx=".34" cy=".32" r=".8"><stop offset="0" stop-color="#7a8098"/><stop offset=".32" stop-color="#2c3044"/><stop offset="1" stop-color="#05060c"/></radialGradient>
  <linearGradient id="cbC" x1="0" x2="1"><stop offset="0" stop-color="#4a4f64"/><stop offset=".5" stop-color="#c9cfdf"/><stop offset="1" stop-color="#33374a"/></linearGradient>
</defs>
<circle cx="76" cy="110" r="64" fill="url(#cbB)" stroke="#000" stroke-width="2"/>
<ellipse cx="52" cy="82" rx="20" ry="11" fill="#fff" opacity=".32" transform="rotate(-32 52 82)"/>
<circle cx="40" cy="104" r="5" fill="#fff" opacity=".18"/>
<g transform="rotate(35 108 48)"><rect x="90" y="34" width="36" height="28" rx="6" fill="url(#cbC)" stroke="#1a1d2a" stroke-width="2.5"/><rect x="90" y="40" width="36" height="5" fill="#fff" opacity=".35"/></g>
<path class="fuse" d="M120 34 C132 14 152 24 146 6" fill="none" stroke="#c9a46a" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100"/>
<path d="M60 120 l10 -26 l6 18 l10 -8 l-6 26 l-6 -14 Z" fill="#ff3a2a" opacity=".85"/>
</svg>`;

/* ---------- 工具 ---------- */
function sprite(html, cls) { const e = document.createElement("div"); e.className = "sprite " + (cls || ""); e.innerHTML = html; $("fx").appendChild(e); return e; }
function place(e, x, y, r = 0, sx = 1, sy = sx, o = 1) {
  e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${r.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
  e.style.opacity = o;
}
function run(dur, fn, done) {
  const t0 = performance.now();
  const f = (t) => { const ms = t - t0, u = Math.min(1, ms / dur); fn(u, ms); if (u < 1) requestAnimationFrame(f); else if (done) done(); };
  requestAnimationFrame(f);
}
function rectOf(el) {
  const st = $("stage").getBoundingClientRect(), k = st.width / 1920 || 1, r = el.getBoundingClientRect();
  return { x: (r.left - st.left) / k, y: (r.top - st.top) / k, w: r.width / k, h: r.height / k };
}
const smokeP = (x, y, o = {}) => FX.part({ t: "smoke", x, y, vx: o.vx ?? rnd(-30, 30), vy: o.vy ?? rnd(-30, 10), drag: o.drag ?? 0.95,
  size: o.size ?? rnd(14, 24), grow: o.grow ?? rnd(30, 70), c: o.c ?? "rgba(255,255,255,1)", o: o.o ?? 0.45, life: o.life ?? rnd(0.9, 1.4) });
const fireP = (x, y, vx, vy, cols) => FX.part({ t: "dot", x: x + rnd(-6, 6), y: y + rnd(-4, 4), vx, vy, drag: 0.93, size: rnd(3, 7), c: pick(cols), life: rnd(0.25, 0.55), flick: true });
const FIRE = ["#fff6c8", "#ffd25a", "#ff9a1f", "#ff5a1f"];

/* ---------- 飞机 ---------- */
function plane({ sfx, onMid }) {
  const e = sprite(PLANE, "c-plane");
  const P0 = { x: -260, y: 760 }, P1 = { x: 700, y: 420 }, P2 = { x: 2180, y: 110 };
  let mid = false, last = 0;
  sfx && sfx("jet");
  run(2100, (u, ms) => {
    const v = u, a = (1 - v) * (1 - v), b = 2 * (1 - v) * v, c = v * v;
    const x = a * P0.x + b * P1.x + c * P2.x, y = a * P0.y + b * P1.y + c * P2.y;
    const dx = 2 * (1 - v) * (P1.x - P0.x) + 2 * v * (P2.x - P1.x), dy = 2 * (1 - v) * (P1.y - P0.y) + 2 * v * (P2.y - P1.y);
    const ang = Math.atan2(dy, dx), deg = ang * 57.3 + Math.sin(ms / 260) * 1.5;
    const s = 0.8 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.3));
    place(e, x, y + Math.sin(ms / 300) * 6, deg, s);
    if (ms - last > 15) {
      last = ms;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      smokeP(x - cs * 140 * s, y - sn * 140 * s - 6, { vx: -cs * 40, vy: -sn * 40 + 6, size: 8, grow: 46, o: 0.55, life: 1.5 });
      fireP(x - cs * 20 * s + 6, y + 30 * s, -cs * 260, -sn * 260, FIRE);
      if (Math.random() < 0.35) FX.glitter(x - cs * 150 * s, y - sn * 150 * s, { n: 2, colors: ["#fff", "#ffd36b", "#3ee7ff"], speed: [20, 80], g: 40, life: [0.6, 1.1] });
    }
    if (!mid && u > 0.42) { mid = true; onMid && onMid(x, y); }
  }, () => e.remove());
}

/* ---------- 火箭（王炸） ---------- */
function rocket({ p, sfx, onBoom }) {
  const e = sprite(ROCKET + FLAME, "c-rocket");
  const fl = e.querySelector(".flame");
  const bx = p.x, by = p.y - 60, top = 190;
  let last = 0, launched = false;
  sfx && sfx("ignite");
  run(1550, (u, ms) => {
    let x = bx, y = by, s = 1, fs;
    if (ms < 260) { s = E.outBack(ms / 260); fs = 0; }
    else if (ms < 760) {   // 点火：火焰变大、底下冒烟，火箭微微颤
      const k = (ms - 260) / 500; fs = 0.25 + 0.5 * k; x += rnd(-1.6, 1.6) * k; y += rnd(-1, 1) * k;
      if (ms - last > 18) {
        last = ms;
        for (const d of [-1, 1]) smokeP(x + d * 20, by + 110, { vx: d * rnd(120, 260), vy: rnd(-40, 0), size: rnd(18, 28), grow: 90, c: "rgba(235,225,215,1)", o: 0.5, life: rnd(1.1, 1.7) });
        fireP(x, by + 120, rnd(-60, 60), rnd(80, 200), FIRE);
      }
    } else {                // 起飞：越飞越快
      if (!launched) { launched = true; sfx && sfx("launch"); }
      const k = E.inC((ms - 760) / 790); y = by - k * (by - top); x = bx + (765 - bx) * k * 0.35; fs = 1.3 + k * 0.4; s = 1 - k * 0.25;
      if (ms - last > 12) {
        last = ms;
        smokeP(x + rnd(-8, 8), y + 120 * s, { vx: rnd(-50, 50), vy: rnd(20, 90), size: rnd(16, 26), grow: 80, c: "rgba(240,232,222,1)", o: 0.5, life: rnd(1.2, 1.8) });
        for (let j = 0; j < 3; j++) fireP(x, y + 125 * s, rnd(-80, 80), rnd(250, 520), FIRE);
      }
    }
    place(e, x, y, (x - bx) * 0.02, s);
    fl.style.setProperty("--fs", fs.toFixed(2));
  }, () => { const x = bx + (765 - bx) * 0.35; e.remove(); onBoom && onBoom(x, top); });
}

/* ---------- 炸弹 ---------- */
function bomb({ p, sfx, onBoom }) {
  const e = sprite(BOMB, "c-bomb");
  const fuse = e.querySelector(".fuse");
  const tx = p.x, ty = p.y - 30;
  let last = 0, hiss = false;
  sfx && sfx("whistle");
  run(1250, (u, ms) => {
    let x = tx, y = ty, sx = 1, sy = 1, r = -8;
    if (ms < 420) { const k = E.inQ(ms / 420); y = -140 + (ty + 140) * k; r = -30 + 22 * k; }
    else if (ms < 620) {   // 落地压扁、弹一下
      const k = (ms - 420) / 200; sy = 1 - 0.22 * Math.sin(Math.PI * Math.min(1, k * 1.6)); sx = 2 - sy; y = ty - Math.max(0, Math.sin(Math.PI * k)) * 26 * (k > 0.4 ? 1 : 0);
      if (ms - 420 < 20) { sfx && sfx("thud"); for (let j = 0; j < 8; j++) smokeP(tx + rnd(-60, 60), ty + 70, { vx: rnd(-160, 160), vy: rnd(-40, 0), c: "rgba(200,190,180,1)", size: 14, o: 0.4 }); }
    } else {               // 引线燃烧，越来越鼓、发红
      if (!hiss) { hiss = true; sfx && sfx("fuse"); }
      const k = (ms - 620) / 630; const pulse = 1 + 0.06 * Math.sin(ms / 30) * k + k * 0.18; sx = sy = pulse;
      e.style.filter = `drop-shadow(0 0 ${(8 + 30 * k).toFixed(0)}px rgba(255,${(120 - 90 * k).toFixed(0)},40,${(0.5 + 0.5 * k).toFixed(2)})) brightness(${(1 + k * 0.5).toFixed(2)})`;
      fuse.setAttribute("stroke-dasharray", `${(100 - 80 * k).toFixed(1)} 100`);
    }
    place(e, x, y, r, sx, sy);
    // 引线火花：跟着引线头走
    if (ms > 120 && ms - last > 16) {
      last = ms;
      const k = Math.max(0, (ms - 620) / 630), fx = x + (66 - 26 * k) * 0.9375 * sx, fy = y + (-84 + 28 * k) * 0.9375 * sy;
      FX.glitter(fx, fy, { n: 4, colors: ["#ffffff", "#fff3a0", "#ffb020", "#ff5a1f"], speed: [80, 320], g: 300, life: [0.2, 0.5] });
      FX.glow(fx, fy, { size: 40, c: "rgba(255,220,120,.9)", life: 0.08 });
    }
  }, () => { e.remove(); onBoom && onBoom(tx, ty); });
}

/* ---------- 顺子 / 连对 ---------- */
function ribbon(r, cols, dy, delay, len) {
  const w = r.w + 160, id = "rb" + Math.random().toString(36).slice(2, 7);
  const e = sprite(`<svg width="${w}" height="70" viewBox="0 0 ${w} 70"><defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${cols[0]}" stop-opacity="0"/><stop offset=".25" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[1]}"/></linearGradient></defs>
    <path d="M10 35 Q ${w / 2} ${35 - 16} ${w - 50} 35" fill="none" stroke="url(#${id})" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100" style="animation:ribbonDraw ${len}ms ${delay}ms ease-out forwards;filter:drop-shadow(0 0 10px ${cols[1]})"/>
    <path d="M${w - 62} 14 L${w - 12} 35 L${w - 62} 56 L${w - 50} 35 Z" fill="${cols[1]}" stroke="#fff" stroke-width="2" style="opacity:0;animation:ribbonHead 300ms ${delay + len - 120}ms ease-out forwards;filter:drop-shadow(0 0 12px ${cols[1]})"/></svg>`, "c-ribbon");
  place(e, r.x + r.w / 2 + 20, r.y + r.h + dy);
  setTimeout(() => { e.style.transition = "opacity .5s"; e.style.opacity = 0; }, delay + len + 700);
  setTimeout(() => e.remove(), delay + len + 1300);
}
function wave(el, { pairs, cols, sfx }) {
  const cards = [...el.querySelectorAll(".card")];
  if (!cards.length) return 0;
  const r = rectOf(el), step = pairs ? 110 : 70;
  cards.forEach((c, i) => {
    const k = pairs ? (i >> 1) : i, d = k * step;
    c.style.setProperty("--gd", d + "ms"); c.classList.remove("glint"); void c.offsetWidth; c.classList.add("glint");
    c.animate(pairs
      ? [{ transform: "none" }, { transform: "translateY(-30px) rotateY(180deg)", filter: "brightness(1.25)" }, { transform: "rotateY(360deg)" }]
      : [{ transform: "none" }, { transform: "translateY(-30px) scale(1.06)", filter: "brightness(1.3) drop-shadow(0 0 14px #ffe08a)" }, { transform: "none" }],
      { duration: pairs ? 520 : 420, delay: d, easing: "cubic-bezier(.3,1.4,.5,1)" });
    setTimeout(() => {
      const q = rectOf(c);
      FX.glitter(q.x + q.w * 0.5, q.y + 8, { n: 14, colors: cols.concat("#fff"), speed: [60, 300], g: 260, life: [0.5, 1] });
      if (!pairs || i % 2 === 0) sfx && sfx("note", k);
    }, d + 120);
  });
  const total = (pairs ? (cards.length >> 1) : cards.length) * step;
  if (pairs) { ribbon(r, cols, 18, 0, total + 200); ribbon(r, [cols[2], cols[3]], 44, 120, total + 200); }
  else ribbon(r, cols, 24, 0, total + 200);
  return total;
}

/* ---------- 三带 ---------- */
function rings(cardEls, { sfx }) {
  cardEls.forEach((c, i) => {
    setTimeout(() => {
      const q = rectOf(c);
      const e = sprite(`<div class="halo"></div>`, "c-halo");
      place(e, q.x + q.w / 2, q.y - 6);
      e.animate([{ transform: e.style.transform + " translateY(-60px) scale(1.8)", opacity: 0 }, { offset: 0.45, transform: e.style.transform, opacity: 1 }, { transform: e.style.transform, opacity: 0 }],
        { duration: 900, easing: "cubic-bezier(.2,1.3,.4,1)", fill: "forwards" });
      setTimeout(() => e.remove(), 950);
      c.animate([{ filter: "none" }, { filter: "brightness(1.25) drop-shadow(0 0 16px #ffd25a)", transform: "translateY(-14px)" }, { filter: "none" }], { duration: 600, easing: "ease-out" });
      FX.glitter(q.x + q.w / 2, q.y, { n: 18, colors: ["#fff6c0", "#ffd36b", "#fff"], speed: [80, 320], g: 200 });
      sfx && sfx("chime", i);
    }, 380 + i * 170);
  });
}

/* ---------- 四带二：盖印章 ---------- */
function seal(el, text, { sfx }) {
  const r = rectOf(el);
  const e = sprite(`<div class="seal"><span>${text}</span></div>`, "c-seal");
  const x = r.x + r.w + 96, y = r.y + r.h / 2;
  e.animate([
    { transform: `translate(${x}px,${y}px) translate(-50%,-50%) rotate(-30deg) scale(3)`, opacity: 0 },
    { offset: 0.25, transform: `translate(${x}px,${y}px) translate(-50%,-50%) rotate(-12deg) scale(.92)`, opacity: 1 },
    { offset: 0.35, transform: `translate(${x}px,${y}px) translate(-50%,-50%) rotate(-12deg) scale(1)`, opacity: 1 },
    { offset: 0.85, transform: `translate(${x}px,${y}px) translate(-50%,-50%) rotate(-12deg) scale(1)`, opacity: 1 },
    { transform: `translate(${x}px,${y}px) translate(-50%,-50%) rotate(-12deg) scale(1.05)`, opacity: 0 }],
    { duration: 1700, delay: 350, easing: "cubic-bezier(.3,1.2,.5,1)", fill: "both" });
  setTimeout(() => {
    sfx && sfx("stamp");
    FX.burst(x, y, { n: 40, colors: ["#c4121e", "#8a0a10", "#ff5a4a"], speed: [150, 500], g: 600, life: [0.3, 0.7] });
    FX.ring(x, y, { c: "#ff5a4a", vr: 600, w: 6, life: 0.4 });
  }, 350 + 420);
  setTimeout(() => e.remove(), 2100);
}

/* ---------- 单张 / 对子 ---------- */
function glint(el, { big }) {
  const cards = [...el.querySelectorAll(".card")];
  cards.forEach((c, i) => { c.style.setProperty("--gd", 300 + i * 80 + "ms"); c.classList.remove("glint"); void c.offsetWidth; c.classList.add("glint"); });
  const r = rectOf(el);
  setTimeout(() => {
    FX.glitter(r.x + r.w / 2, r.y + r.h / 2, { n: big ? 40 : 14, colors: big ? ["#fff6c0", "#ffd36b", "#fff"] : ["#ffffff", "#fff3c0"], speed: [60, big ? 420 : 220], g: 120, life: [0.5, 1.1] });
    if (big) { FX.rays(r.x + r.w / 2, r.y + r.h / 2, "rgba(255,211,107,.45)", 1300); FX.glow(r.x + r.w / 2, r.y + r.h / 2, { size: 220, c: "rgba(255,220,130,.8)", life: 0.4 }); }
  }, 320);
}

window.COMBO = { plane, rocket, bomb, wave, rings, seal, glint, rectOf };
})();
