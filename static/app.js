(() => {
"use strict";

/* ================= 常量 ================= */
const NAMES = { 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "小王", 17: "大王" };
const suit = (s) => `<svg class="su"><use href="#su${s}"/></svg>`;
const JESTER = `<svg class="su" viewBox="0 0 100 120"><use href="#jester"/></svg>`;
const PALETTE = ["#4f8cff", "#ff5f7e", "#2fd3a0", "#a66bff", "#ffb020", "#ff6fb5", "#22c1ee", "#8bd448", "#ff8a4c", "#7a7dff"];
const BIG_TEXT = { bomb: "炸弹", rocket: "王炸", plane: "飞机", plane_single: "飞机", plane_pair: "飞机", straight: "顺子", pair_straight: "连对",
  four_two_single: "四带二", four_two_pair: "四带两对", trio: "三张", trio_single: "三带一", trio_pair: "三带二" };
const CROWN = `<svg class="crown" viewBox="0 0 64 44"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#ffc83d"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs><path d="M4 14 L18 26 L32 4 L46 26 L60 14 L54 40 L10 40 Z" fill="url(#cg)" stroke="#a85a00" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="4" r="4" fill="#ff4d6d"/><circle cx="4" cy="14" r="3.5" fill="#3ee7ff"/><circle cx="60" cy="14" r="3.5" fill="#3ee7ff"/><rect x="10" y="33" width="44" height="7" fill="#ffdd6b" opacity=".7"/></svg>`;
const Q = new URLSearchParams(location.search);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (n) => Number(n || 0).toLocaleString("en-US");

/* ================= 状态 ================= */
const G = {
  live: false, profiles: {}, snap: null, gameNo: 0, bid: 0, mult: 1, landlord: -1, phase: "等待开局",
  roles: [null, null, null], bottom: [], used: {}, turn: -1, endSeq: 0, think: null,
  seats: [0, 1, 2].map(() => ({ name: "", hand: [], played: null, label: "", kind: "", hot: false, thinking: false, t0: 0, alarmed: false, typing: null })),
};

/* ================= 颜色 / 头像 ================= */
function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
const prof = (name) => G.profiles[name] || {};
function colorOf(name) { return prof(name).color || PALETTE[hash(name) % PALETTE.length]; }
function hexRgb(hex) { const m = hex.replace("#", ""); const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function pcVars(name) {
  let [r, g, b] = [79, 140, 255];
  try { [r, g, b] = hexRgb(colorOf(name)); } catch (e) { /* 非法颜色用默认 */ }
  const d = (x) => Math.round(x * 0.45);
  return `--pc:rgb(${r},${g},${b});--pc2:rgb(${d(r)},${d(g)},${d(b)});--pcg:rgba(${r},${g},${b},.6)`;
}
function initial(name) { const s = String(name || "?").trim(); return esc(Array.from(s)[0] || "?").toUpperCase(); }
function emblemHtml(name) {
  const p = prof(name);
  return `<div class="emblem"><div class="hex"></div><b>${initial(name)}</b><small>${esc(p.title || name || "")}</small></div>`;
}
// 图片加载失败时换成徽章
window.__avErr = (img) => { const art = img.closest(".art"); if (art) { art.className = "art"; art.innerHTML = emblemHtml(art.dataset.name); } else img.replaceWith(document.createTextNode(img.dataset.i || "?")); };
// 立绘先不给 src，处理完（去背景、裁边、裁脸）再填进去，避免先闪一下白底原图
function artHtml(name) {
  const av = prof(name).avatar;
  return av ? `<img data-art="${esc(av)}" data-name="${esc(name)}" alt="">` : emblemHtml(name);
}
function artCls(name) {
  const p = prof(name);
  if (!p.avatar) return "art";
  return "art" + (p.art === "bust" ? "" : " full") + (p.cutout === false ? " masked" : "");
}
function mini(name, cls = "") {
  const av = prof(name).avatar;
  return `<div class="mini ${cls}" style="${pcVars(name)}">${av ? `<img data-face="${esc(av)}" data-name="${esc(name)}" data-i="${initial(name)}" alt="">` : initial(name)}</div>`;
}

/* ================= 立绘处理 =================
 * 形象图多是白底全身立绘，这里在浏览器里处理一次并缓存：
 *   1. cutout="auto"：从图片四边往里找和背景同色的连通区域，变成透明（人物的描边会挡住，衣服里的白色不受影响）
 *   2. 裁掉四周透明边，让人物顶到框
 *   3. 裁出脸部方图给排行榜、战况、结算用（找人物最上面一段够宽的地方当头，细长的武器、法杖不算；可用 face 手动指定） */
const ART = new Map();
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const toUrl = (cv) => new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : cv.toDataURL()), "image/png"));
function removeBg(d, W, H) {
  const at = (x, y) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  if (corners.every((i) => d[i + 3] < 20)) return;            // 已经是透明底
  const samples = [];
  for (let x = 0; x < W; x += Math.max(1, W >> 5)) samples.push(at(x, 0), at(x, H - 1));
  for (let y = 0; y < H; y += Math.max(1, H >> 5)) samples.push(at(0, y), at(W - 1, y));
  const med = (o) => samples.map((i) => d[i + o]).sort((a, b) => a - b)[samples.length >> 1];
  const br = med(0), bgc = med(1), bb = med(2), T = 2700;
  const dist = (i) => { const r = d[i] - br, g = d[i + 1] - bgc, b = d[i + 2] - bb; return r * r + g * g + b * b; };
  const seen = new Uint8Array(W * H), st = [];
  const push = (x, y) => { const p = y * W + x; if (!seen[p] && d[p * 4 + 3] > 0 && dist(p * 4) < T) { seen[p] = 1; st.push(p); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p / W) | 0;
    d[p * 4 + 3] = 0;
    if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1);
  }
  // 边缘羽化：紧挨背景、颜色又接近背景的像素半透明，去掉白边
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x, i = p * 4;
    if (seen[p] || !(seen[p - 1] || seen[p + 1] || seen[p - W] || seen[p + W])) continue;
    const k = dist(i);
    if (k < T * 4) d[i + 3] = Math.min(d[i + 3], Math.round(255 * Math.sqrt(k / (T * 4))));
  }
}
async function processArt(src, p) {
  const img = await loadImg(src);
  const k = Math.min(1, 1200 / img.naturalHeight);
  const W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  let id;
  try { id = g.getImageData(0, 0, W, H); } catch (e) { return { full: src, face: src, raw: true }; }   // 跨域图片读不了像素，原样用
  const d = id.data;
  if (p.cutout === "auto" || p.cutout === undefined) removeBg(d, W, H);
  g.putImageData(id, 0, 0);
  // 人物外框
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { full: src, face: src, raw: true };
  const pad = Math.round(H * 0.01);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const full = document.createElement("canvas"); full.width = bw; full.height = bh;
  full.getContext("2d").drawImage(cv, x0, y0, bw, bh, 0, 0, bw, bh);
  // 脸
  let fx, fy, fs;
  if (Array.isArray(p.face) && p.face.length >= 2) {
    fx = (p.face[0] / 100) * W; fy = (p.face[1] / 100) * H; fs = ((p.face[2] || 16) / 100) * H;
  } else {
    let top = y0;
    for (let y = y0; y < y1; y++) {
      let n = 0; for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 24) n++;
      if (n > bw * 0.12) { top = y; break; }
    }
    let sx = 0, n = 0;
    for (let y = top; y < Math.min(y1, top + bh * 0.1); y++) for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 24) { sx += x; n++; }
    fx = n ? sx / n : (x0 + x1) / 2; fs = Math.min(bh * 0.17, bw); fy = top + fs * 0.48;
  }
  const fc = document.createElement("canvas"); fc.width = fc.height = 256;
  const sheet = p.faces ? await sheetFace(p.faces).catch(() => null) : null;
  if (sheet) fc.getContext("2d").drawImage(sheet.img, sheet.x, sheet.y, sheet.s, sheet.s, 0, 0, 256, 256);
  else fc.getContext("2d").drawImage(cv, fx - fs / 2, fy - fs / 2, fs, fs, 0, 0, 256, 256);
  return { full: await toUrl(full), face: await toUrl(fc) };
}
// 表情图：2 行 5 列的头像表，取第一格（平常表情），裁成头到肩的方图
async function sheetFace(src) {
  const img = await loadImg(src);
  const cw = img.naturalWidth / 5, ch = img.naturalHeight / 2;
  const cv = document.createElement("canvas"); cv.width = Math.round(cw); cv.height = Math.round(ch);
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, cw, ch, 0, 0, cv.width, cv.height);
  const W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
  if (x1 < 0) return null;
  const s = Math.min(Math.max(x1 - x0 + 1, H * 0.6), H - y0, W);
  const x = Math.max(0, Math.min(W - s, (x0 + x1) / 2 - s / 2));
  return { img, x, y: Math.max(0, y0 - s * 0.02), s };
}
/* ================= 表情 =================
 * 表情图是 2 行 5 列，所有角色顺序一样：
 *   0 平常  1 开心  2 思考  3 惊讶  4 生气  5 委屈  6 大笑  7 得意  8 害羞  9 兴奋
 * 牌桌上每个立绘旁有个圆形表情框，跟着出牌切换，几秒后回到平常；结算时的表情一直保持到下一局。 */
const EXPR = { calm: 0, happy: 1, think: 2, shock: 3, angry: 4, sad: 5, laugh: 6, smug: 7, shy: 8, hype: 9 };
const exprTimers = [0, 0, 0];
function setExpr(i, mood, ms = 2600) {
  const k = typeof mood === "number" ? mood : EXPR[mood] ?? 0;
  l2dMood(i, k);
  const el = $("seat" + i) && $("seat" + i).querySelector(".expr");
  if (!el) {
    clearTimeout(exprTimers[i]);
    if (ms > 0 && k !== 0) exprTimers[i] = setTimeout(() => setExpr(i, 0, 0), ms);
    return;
  }
  const p = prof(G.seats[i].name);
  const face = el.querySelector("i");
  if (!face.style.backgroundImage) face.style.backgroundImage = `url("${p.faces}")`;
  face.style.backgroundPosition = `${(k % 5) * 25}% ${k < 5 ? 0 : 100}%`;
  if (el.dataset.k !== String(k)) { el.dataset.k = k; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  clearTimeout(exprTimers[i]);
  if (ms > 0 && k !== 0) exprTimers[i] = setTimeout(() => setExpr(i, 0, 0), ms);
}
const others = (i) => [0, 1, 2].filter((j) => j !== i);
function exprPlay(d) {
  const i = d.seat, k = d.kind || "";
  if (!d.cards.length) { l2dAct(i, "shake"); return setExpr(i, "sad"); }
  if (k === "rocket" || k === "bomb") {
    setExpr(i, "smug", 3200);
    l2dAct(i, "tilt");
    others(i).forEach((j) => setExpr(j, G.roles[j] && G.roles[j] === G.roles[i] ? "laugh" : "shock", 3200));
    return;
  }
  if (k.startsWith("plane") || k === "straight" || k === "pair_straight" || k.startsWith("four")) return setExpr(i, "hype");
  setExpr(i, Math.random() < 0.5 ? "happy" : "shy", 2000);
}

/* ================= Live2D（可选） =================
 * 角色配置里写了 live2d.model（model3.json）时，牌桌上的立绘换成 Live2D 模型（官方 Cubism SDK，见 live2d/README.md）。
 * live2d.js、Cubism Core、WebGL、模型文件任何一个不可用，都继续显示原来的立绘图片。?l2d=0 关闭。 */
const L2D = { on: Q.get("l2d") !== "0", api: null, loading: null, seatIds: ["", "", ""] };
// 表情图的 10 种表情 → Live2D 的 8 种情绪
const MOOD_EMOTION = ["neutral", "happy", "thinking", "surprised", "angry", "sad", "happy", "confident", "shy", "happy"];
function l2dApi() {
  if (!L2D.on) return Promise.resolve(null);
  if (L2D.loading) return L2D.loading;
  L2D.loading = new Promise((res) => {
    if (window.Live2D) return res(window.Live2D);
    const s = document.createElement("script");
    s.src = "live2d/live2d.js";
    s.onload = () => res(window.Live2D || null);
    s.onerror = () => res(null);
    document.head.appendChild(s);
  }).then((api) => {
    if (!api) { console.warn("[Live2D] live2d/live2d.js 加载失败，使用立绘图片"); return null; }
    if (!api.webglSupport().webgl) { console.warn("[Live2D] 浏览器不支持 WebGL，使用立绘图片"); return null; }
    api.setAudioContextProvider(() => FX.ctx());   // 和音效共用一个 AudioContext
    return api.loadCore().then(() => { api.registry.maxActive = 4; return (L2D.api = api); },
      (e) => { console.warn("[Live2D]", e.message); return null; });
  });
  return L2D.loading;
}
const l2dKey = (name) => prof(name).id || name;
function l2dCtrl(i) {
  if (!L2D.api || !L2D.seatIds[i]) return null;
  const c = L2D.api.registry.get(L2D.seatIds[i]);
  return c && c.ready ? c : null;
}
function l2dCtrlByName(name) { const i = G.seats.findIndex((s) => s.name === name); return i >= 0 ? l2dCtrl(i) : null; }
function mountL2D(i) {
  const s = G.seats[i], cfg = prof(s.name).live2d;
  L2D.seatIds[i] = "";
  if (!s.name || !cfg || !cfg.model || !L2D.on) return;
  const portrait = $("seat" + i).querySelector(".portrait");
  const holder = document.createElement("div");
  holder.className = "l2d";
  portrait.appendChild(holder);
  const key = l2dKey(s.name);
  l2dApi().then((api) => {
    if (!api || !holder.isConnected) return null;
    if (!api.registry.has(key)) api.registry.register({ id: key, name: s.name, ...cfg });
    return api.registry.mount(key, holder);
  }).then((ctrl) => {
    if (!ctrl || !holder.isConnected) return;
    L2D.seatIds[i] = key;
    portrait.classList.add("l2d-on");
    const ex = $("seat" + i).querySelector(".expr");
    ctrl.setEmotion(MOOD_EMOTION[+(ex && ex.dataset.k) || 0] || "neutral");
  }).catch((e) => {
    console.warn(`[Live2D] ${s.name} 模型加载失败，继续用立绘：${e.message}`);
    holder.remove();
  });
}
function l2dRetain() { if (L2D.api) L2D.api.registry.retain(G.seats.map((s) => l2dKey(s.name))); }
function l2dMood(i, k) { const c = l2dCtrl(i); if (c) c.setEmotion(MOOD_EMOTION[k] || "neutral"); }
function l2dAct(i, a) { const c = l2dCtrl(i); if (c) c.interact(a).catch(() => {}); }
function l2dStopAll() { for (let i = 0; i < 3; i++) { const c = l2dCtrl(i); if (c) c.stopSpeaking(); } }

function artOf(name, src) {
  if (!ART.has(src)) {
    const pr = processArt(src, prof(name)).catch(() => null);
    pr.then((r) => (pr.ready = r));     // 处理完后同步可取（大招特写用）
    ART.set(src, pr);
  }
  return ART.get(src);
}
function hydrate(root) {
  root.querySelectorAll("img[data-art]:not([src]), img[data-face]:not([src])").forEach((img) => {
    const src = img.dataset.art || img.dataset.face;
    artOf(img.dataset.name, src).then((r) => {
      if (!r) return window.__avErr(img);
      img.src = img.dataset.art ? r.full : r.face;
      if (!r.raw && img.dataset.face) img.classList.add("face");
    });
  });
}
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) hydrate(n); })
  .observe(document.getElementById("stage"), { childList: true, subtree: true });

/* ================= 场景（背景 / 牌桌 / 牌匾） ================= */
function pagoda(cx, base, tiers, w, h) {
  let s = "", y = base;
  for (let k = 0; k < tiers; k++) {
    const ww = w * (1 - k * 0.17), bh = h * (k ? 0.7 : 1);
    s += `<rect x="${cx - ww * 0.36}" y="${y - bh}" width="${ww * 0.72}" height="${bh}" fill="url(#bld)"/>`;
    for (let j = 0; j < 3; j++) s += `<rect x="${cx - ww * 0.27 + j * ww * 0.2}" y="${y - bh * 0.72}" width="${ww * 0.09}" height="${bh * 0.42}" rx="2" fill="#ffb84a" opacity=".5"/>`;
    y -= bh;
    const rw = ww * 0.62, rh = 20 + 8 * (tiers - k) / tiers;
    s += `<path d="M${cx - rw - 28} ${y + 4} Q${cx - rw} ${y + 2} ${cx - rw + 14} ${y - 9} L${cx - rw * 0.55} ${y - rh} L${cx + rw * 0.55} ${y - rh} L${cx + rw - 14} ${y - 9} Q${cx + rw} ${y + 2} ${cx + rw + 28} ${y + 4} Z" fill="#0a1f2c" stroke="#2de2ff" stroke-width="2" stroke-opacity=".6"/>`;
    y -= rh;
  }
  return s + `<path d="M${cx} ${y - 44} L${cx - 6} ${y} L${cx + 6} ${y} Z" fill="#e9b54a"/><circle cx="${cx}" cy="${y - 48}" r="5" fill="#ffd25a"/>`;
}
function buildScene() {
  let stars = "";
  for (let k = 0; k < 70; k++) stars += `<circle cx="${(hash("x" + k) % 1920)}" cy="${(hash("y" + k) % 300)}" r="${(k % 3) * 0.6 + 0.6}" fill="#fff" opacity="${0.2 + (k % 5) * 0.12}"/>`;
  let city = "";
  for (let x = -20; x < 1940; x += 46) { const hh = 40 + (hash("c" + x) % 90); city += `<rect x="${x}" y="${400 - hh}" width="40" height="${hh}" fill="#081a26"/>`; }
  let lanterns = "", path = "M-20 70 Q 360 150 765 90 Q 1170 150 1560 70";
  for (let k = 0; k <= 12; k++) {
    const t = k / 12, x = -20 + t * 1580, y = 70 + Math.sin(t * Math.PI * 2) * -14 + 55 * Math.sin(t * Math.PI) - 10;
    if (x > 360 && x < 1170 && y < 190) continue;   // 牌匾挡住的地方不画
    lanterns += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)})"><line x1="0" y1="-8" x2="0" y2="4" stroke="#e9b54a" stroke-width="2"/>
      <ellipse cx="0" cy="22" rx="17" ry="20" fill="url(#lan)"/><rect x="-9" y="2" width="18" height="5" fill="#e9b54a"/><rect x="-9" y="38" width="18" height="5" fill="#e9b54a"/>
      <line x1="0" y1="43" x2="0" y2="58" stroke="#ffcf4a" stroke-width="3"/><ellipse cx="0" cy="22" rx="34" ry="34" fill="url(#lanGlow)"/></g>`;
  }
  $("scene").innerHTML = `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040915"/><stop offset=".3" stop-color="#0a1c34"/><stop offset=".55" stop-color="#0d3343"/><stop offset="1" stop-color="#071c22"/></linearGradient>
    <radialGradient id="warm" cx=".4" cy=".22" r=".5"><stop offset="0" stop-color="#ffb04a" stop-opacity=".35"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
    <radialGradient id="redGlow" cx=".4" cy="1" r=".6"><stop offset="0" stop-color="#ff3a1a" stop-opacity=".35"/><stop offset="1" stop-color="#ff3a1a" stop-opacity="0"/></radialGradient>
    <linearGradient id="bld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2a3a"/><stop offset="1" stop-color="#06141c"/></linearGradient>
    <radialGradient id="lan" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffe08a"/><stop offset=".35" stop-color="#ff3a2a"/><stop offset="1" stop-color="#8a0a10"/></radialGradient>
    <radialGradient id="lanGlow"><stop offset="0" stop-color="#ff7a3a" stop-opacity=".45"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <pattern id="crowd" width="16" height="13" patternUnits="userSpaceOnUse"><rect width="16" height="13" fill="#071722"/><circle cx="4" cy="5" r="3.6" fill="#0e2534"/><circle cx="12" cy="10" r="3.6" fill="#11293a"/><circle cx="12" cy="3" r=".9" fill="#7ff" opacity=".35"/></pattern>
    <filter id="glow"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>${stars}
  <rect width="1920" height="1080" fill="url(#warm)"/>
  ${city}
  <ellipse cx="765" cy="690" rx="1180" ry="390" fill="url(#crowd)"/>
  <ellipse cx="765" cy="690" rx="1180" ry="390" fill="none" stroke="#2de2ff" stroke-width="6" opacity=".35" filter="url(#glow)"/>
  <ellipse cx="765" cy="690" rx="1180" ry="390" fill="none" stroke="#9ff6ff" stroke-width="2" opacity=".6"/>
  <ellipse cx="765" cy="720" rx="1000" ry="300" fill="none" stroke="#2de2ff" stroke-width="2" opacity=".35" stroke-dasharray="30 14"/>
  ${pagoda(330, 430, 3, 230, 64)}${pagoda(1200, 430, 3, 230, 64)}${pagoda(765, 330, 2, 300, 54)}
  <path d="${path}" stroke="#3a1a08" stroke-width="2" fill="none"/>${lanterns}
  <rect width="1920" height="1080" fill="url(#redGlow)"/>`;

  // 牌桌：回纹圈 + 祥云 + 龙纹
  const cloud = (x, y, s, flip) => `<path transform="translate(${x},${y}) scale(${flip ? -s : s},${s})" d="M0 0 q 18 -30 48 -12 q 18 -26 46 -2 q 32 -6 26 24 q -8 22 -40 12 q -20 20 -46 2 q -30 12 -34 -24 z M30 -2 q 10 -10 22 0 M70 4 q 8 -8 18 0" fill="none" stroke="#e6b54a" stroke-width="3" opacity=".45"/>`;
  $("tableArt").innerHTML = `
    <ellipse cx="745" cy="330" rx="640" ry="290" fill="none" stroke="#e6b54a" stroke-width="2" opacity=".35"/>
    <ellipse cx="745" cy="330" rx="610" ry="270" fill="none" stroke="#e6b54a" stroke-width="10" opacity=".14" stroke-dasharray="14 8"/>
    <ellipse cx="745" cy="340" rx="330" ry="150" fill="none" stroke="#ffd25a" stroke-width="3" opacity=".4"/>
    <ellipse cx="745" cy="340" rx="300" ry="132" fill="none" stroke="#ffd25a" stroke-width="12" opacity=".14" stroke-dasharray="6 6 18 6"/>
    <path d="M300 470 C 420 230, 620 560, 780 330 S 1040 160, 1190 400" fill="none" stroke="#e6b54a" stroke-width="30" opacity=".12" stroke-linecap="round"/>
    <path d="M300 470 C 420 230, 620 560, 780 330 S 1040 160, 1190 400" fill="none" stroke="#ffd25a" stroke-width="46" opacity=".12" stroke-dasharray="3 13"/>
    <path d="M1190 400 l 40 -30 l -8 34 l 34 6 l -44 22 Z" fill="#e6b54a" opacity=".22"/>
    ${cloud(240, 250, 1.1)}${cloud(1250, 250, 1.1, true)}${cloud(330, 520, .9)}${cloud(1160, 520, .9, true)}
    <text x="745" y="390" text-anchor="middle" font-size="150" font-weight="900" fill="#ffd25a" opacity=".1" font-family="KaiTi, STKaiti, serif">斗</text>`;

  // 牌匾两侧的金色翅膀
  let wing = "";
  for (let k = 0; k < 6; k++) {
    const bx = 196, by = 46 + k * 15, tx = 40 + k * 20, ty = 4 + k * 30;
    wing += `<path d="M${bx} ${by} Q ${(bx + tx) / 2} ${ty - 16 + k * 4} ${tx} ${ty} Q ${(bx + tx) / 2 + 20} ${ty + 26} ${bx} ${by + 14} Z" fill="url(#gGold)" stroke="#6a3a08" stroke-width="2"/>`;
  }
  $("plaque").querySelector(".wings").innerHTML = `<g>${wing}</g><g transform="translate(900,0) scale(-1,1)">${wing}</g>
    <path d="M450 2 l 16 12 l -16 12 l -16 -12 Z" fill="#ff3a3a" stroke="#ffd25a" stroke-width="3"/>`;

  // 漂浮的火星
  let em = "";
  for (let k = 0; k < 36; k++) em += `<i style="left:${(hash("e" + k) % 1520)}px;--s:${2 + (k % 4)}px;--d:${7 + (k % 7)}s;--dl:-${(k * 0.7) % 9}s;--x:${(k % 2 ? 1 : -1) * (40 + (k * 13) % 120)}px"></i>`;
  $("embers").innerHTML = em;
}

/* ================= 扑克牌 ================= */
function takeSuit(r) { if (r >= 16) return -1; const i = G.used[r] || 0; G.used[r] = i + 1; return i % 4; }
function toCards(ranks) { return ranks.map((r) => ({ r, s: takeSuit(r) })); }
const byDesc = (a, b) => b.r - a.r || a.s - b.s;
const byAsc = (a, b) => a.r - b.r || a.s - b.s;
const isRed = (c) => c.r === 17 || c.s === 1 || c.s === 3;

function cardHtml(c, i) {
  if (c.back) return `<div class="card back" style="--i:${i}"></div>`;
  if (c.r >= 16) {
    return `<div class="card joker ${c.r === 17 ? "red" : "black"}" style="--i:${i}"><div class="cr"><b>J<br>O<br>K<br>E<br>R</b></div><div class="cc">${JESTER}</div></div>`;
  }
  return `<div class="card${isRed(c) ? " red" : ""}" style="--i:${i}"><div class="cr"><b${c.r === 10 ? ' class="ten"' : ""}>${NAMES[c.r]}</b><i>${suit(c.s)}</i></div><div class="cc">${suit(c.s)}</div></div>`;
}
function cardsHtml(cards, perRow, cls = "", style = "") {
  let html = `<div class="cards ${cls}" style="${style}">`, i = 0;
  for (let k = 0; k < cards.length; k += perRow) {
    html += `<div class="row">` + cards.slice(k, k + perRow).map((c) => cardHtml(c, i++)).join("") + `</div>`;
  }
  return html + `</div>`;
}
function chipsHtml(cards) {
  return `<span class="cks">` + cards.slice().sort(byAsc).map((c) => c.r >= 16
    ? `<span class="ck jk">${c.r === 17 ? "大王" : "小王"}</span>`
    : `<span class="ck${isRed(c) ? " r" : ""}">${NAMES[c.r]}</span>`).join("") + `</span>`;
}
function fmtRanks(ranks) { return ranks.length ? ranks.slice().sort((a, b) => a - b).map((r) => NAMES[r]).join(" ") : "不要"; }

/* ================= 座位 ================= */
function buildSeat(i) {
  const s = G.seats[i], el = $("seat" + i), p = prof(s.name);
  el.style.cssText = pcVars(s.name);
  const meta = [p.title, p.model].filter(Boolean).map(esc).join(" · ");
  el.innerHTML = `
    <div class="portrait"><div class="aura"></div><div class="${artCls(s.name)}" data-name="${esc(s.name)}">${artHtml(s.name)}</div>${CROWN}</div>
    ${p.faces ? `<div class="expr"><i></i></div>` : ""}
    <div class="ai-tag">AI</div>
    <div class="alarm-light"></div>
    <div class="plate">
      <div class="role wait"><span>叫分中</span></div>
      <div class="nameplate"><span class="chip">AI</span><b class="name">${esc(s.name || "等待入座")}</b></div>
      <div class="subrow"><div class="scoreplate">积分 <b class="score">0</b></div><div class="countplate"><i class="cb"></i><b class="cnt">0</b>张</div><span class="stk"></span></div>
      <div class="modelline">${meta}${p.sim ? `<span class="simtag">模拟</span>` : ""}</div>
    </div>
    <div class="hand"></div>`;
  mountL2D(i);
}
function updateSeat(i) {
  const s = G.seats[i], el = $("seat" + i);
  const role = G.roles[i];
  el.classList.toggle("turn", G.turn === i);
  el.classList.toggle("landlord", role === "地主");
  el.classList.toggle("alarm", s.hand.length > 0 && s.hand.length <= 2 && role !== null);
  const st = G.snap && G.snap.stats && G.snap.stats[s.name];
  const r = el.querySelector(".role");
  if (r) {
    r.className = "role " + (role === "地主" ? "dz" : role === "农民" ? "nm" : "wait");
    r.innerHTML = `<span>${role || (s.name ? "叫分中" : "等待")}</span>`;
  }
  const sc = el.querySelector(".score"); if (sc) sc.textContent = st ? num(st.score) : "0";
  const c = el.querySelector(".cnt"); if (c) c.textContent = s.hand.length;
  const k = el.querySelector(".stk"); if (k) k.innerHTML = st && st.streak >= 2 ? `<span class="streak">${st.streak}连胜</span>` : "";
}
function renderHand(i, anim) {
  const s = G.seats[i];
  const h = $("seat" + i).querySelector(".hand");
  if (!h) return;
  const cards = s.hand.slice().sort(byDesc), deal = anim && G.live ? " deal" : "";
  if (i === 2) {
    const cs = cards.length > 1 ? Math.min(56, (1100 - 100) / (cards.length - 1)) : 56;
    h.innerHTML = cardsHtml(cards, 20, "sz-l" + deal, `--cs:${cs.toFixed(1)}px`);
  } else h.innerHTML = cardsHtml(cards, 20, "sz-s" + deal);
}
function renderPlayed(i, anim) {
  const s = G.seats[i], el = $("played" + i);
  if (s.played === null) { el.innerHTML = ""; return; }
  if (s.played === "pass") { el.innerHTML = `<div class="pass">不要</div>`; return; }
  const showLabel = s.kind && s.kind !== "single" && s.kind !== "pair";
  el.innerHTML = (showLabel ? `<div class="label${s.hot ? " hot" : ""}">${esc(s.label)}</div>` : "") +
    cardsHtml(s.played.slice().sort(byAsc), s.played.length > 12 ? 10 : 20, "sz-m" + (anim && G.live ? " in" : ""));
}
function renderAllSeats() { for (let i = 0; i < 3; i++) updateSeat(i); }
function showClock(i, on) { $("clock" + i).classList.toggle("show", on); if (!on) $("clock" + i).classList.remove("slow"); }

/* ================= 气泡 ================= */
function bubble(i, prefix, text, warn) {
  const el = $("bubble" + i), s = G.seats[i];
  clearInterval(s.typing);
  if (!prefix && !text) { el.classList.remove("show"); return; }
  el.classList.toggle("warn", !!warn);
  el.innerHTML = prefix + `<span></span>`;
  el.classList.add("show");
  const span = el.querySelector("span"), chars = Array.from(text || "");
  if (!G.live) { span.textContent = text || ""; return; }
  let k = 0;
  s.typing = setInterval(() => { span.textContent = chars.slice(0, ++k).join(""); if (k >= chars.length) clearInterval(s.typing); }, 35);
}
function hideBubbles() { for (let i = 0; i < 3; i++) bubble(i, "", ""); }
function splitSay(say) {
  // 机器人代打 / 接口出错的提示以 [ 开头
  const m = String(say || "").match(/^\[(.*?)\](.*)$/);
  return m ? { warn: true, text: "! " + m[1] + (m[2] || "") } : { warn: false, text: String(say || "") };
}

/* ================= 牌匾 / 侧栏 ================= */
function setTop() {
  $("gameNo").textContent = G.gameNo || "-";
  $("mult").textContent = "×" + G.mult;
  $("feedHead").textContent = G.gameNo ? `第${G.gameNo}局 ${G.phase}（倍数×${G.mult}）` : "等待开局";
}
function setMult(m) {
  if (m === G.mult) return;
  const up = m > G.mult, no = G.gameNo; G.mult = m;
  const pill = document.querySelector(".pchip.mult");
  const land = () => {
    if (no !== G.gameNo) return;
    setTop(); pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
    if (G.live && up) {
      const q = FX.at(pill);
      FX.burst(q.x, q.y, { n: 60, colors: ["#fff6c0", "#ffd36b", "#ff9f43"], speed: [200, 800], g: 400 });
      FX.ring(q.x, q.y, { c: "#ffd36b", vr: 800, w: 10, life: 0.5 }); sfx("big");
    }
  };
  if (!G.live || !up) return land();
  setTimeout(() => { if (G.live) FX.fly(`×${m}`, { x: 765, y: 420 }, FX.at(pill), 700, "mult", land); else land(); }, 1100);
}
function setPhase(t) { G.phase = t; $("phase").textContent = t; setTop(); }
function setHint(t) { $("turnHint").textContent = t || ""; }

function medal(n) {
  const c = [["#fff3b0", "#ffc21a", "#8a5000"], ["#ffffff", "#c9d2e0", "#5a6580"], ["#ffd8b0", "#d9813a", "#6a2a08"]][n - 1];
  return `<svg class="medal" viewBox="0 0 40 40"><path d="M9 0 L17 15 L23 15 L31 0 Z" fill="#d4202a" stroke="#7a0a10" stroke-width="1"/><circle cx="20" cy="25" r="14" fill="${c[1]}" stroke="${c[2]}" stroke-width="2.5"/>
    <circle cx="20" cy="25" r="10" fill="none" stroke="${c[0]}" stroke-width="1.5"/><text x="20" y="31" font-size="16" font-weight="900" text-anchor="middle" fill="${c[2]}" font-family="Arial Black, sans-serif">${n}</text></svg>`;
}
function renderBoard(snap, ended) {
  if (!snap) return;
  const onTable = new Set(snap.table || []);
  const rows = Object.entries(snap.stats || {}).sort((a, b) => b[1].score - a[1].score || b[1].wins - a[1].wins).slice(0, 5);
  $("rank").innerHTML = rows.map(([n, s], idx) => `
    <div class="rk${idx === 0 ? " r1" : ""}${onTable.has(n) ? " on" : ""}">
      ${idx < 3 ? medal(idx + 1) : `<span class="no">${idx + 1}</span>`}${mini(n)}
      <div class="nm">${esc(n)}<small>${s.wins}胜${s.losses}负${s.streak >= 2 ? ` · ${s.streak}连胜` : ""}</small></div>
      <div class="sc">积分<b class="${s.score < 0 ? "neg" : ""}">${num(s.score)}</b></div>
    </div>`).join("");
  const q = snap.queue || [], out = snap.out || [], base = (snap.game_no || 0) + (ended ? 2 : 1);
  const circled = (i) => "①②③④⑤⑥⑦⑧⑨⑩"[i] || i + 1;
  $("queue").innerHTML = (q.length ? q.slice(0, 3).map((n, i) => `<div class="q${i === 0 ? " next" : ""}"><span class="qn">${circled(i)}</span>${mini(n)}<span class="nm">${esc(n)}</span>
      <span class="when">(${base + i === G.gameNo + 1 ? "下局上场" : `第${base + i}局上场`})</span></div>`).join("") : `<div class="empty">暂无挑战者</div>`) +
    out.slice(0, 2).map((n) => `<div class="q gone">${mini(n)}<span class="nm">${esc(n)}</span><span class="when">已出局</span></div>`).join("");
}

/* ================= 实时战况 ================= */
function trimFeed() { const f = $("feed"); while (f.children.length > 6) f.firstElementChild.remove(); }
function feed(name, act, opts = {}) {
  const f = $("feed");
  dropThinking();
  const d = document.createElement("div");
  if (!name) { d.className = "fi sys"; d.textContent = act; }
  else {
    d.className = "fi" + (opts.hot ? " hot" : "");
    d.innerHTML = `${mini(name)}<div class="body"><div class="line"><span class="who">${esc(name)}</span><span class="act${opts.pass ? " pass" : ""}">${esc(act)}</span>${opts.chips || ""}</div>` +
      (opts.say ? `<span class="say">“${esc(opts.say)}”</span>` : "") + `</div>`;
  }
  f.appendChild(d); trimFeed();
}
function feedThinking(name, what) {
  dropThinking();
  const d = document.createElement("div");
  d.className = "fi thinking"; d.id = "thinkRow";
  d.innerHTML = `${mini(name)}<div class="body"><div class="line"><span class="who">${esc(name)}</span><span class="act">${what}</span><span class="dots"><i></i><i></i><i></i></span><span class="tm">0.0s</span></div></div>`;
  $("feed").appendChild(d); trimFeed();
}
function dropThinking() { const t = $("thinkRow"); if (t) t.remove(); }
function ticker(text, hot) {
  const t = $("ticker"); t.querySelector("span").textContent = text;
  if (hot && G.live) { t.classList.remove("hot"); void t.offsetWidth; t.classList.add("hot"); }
}

/* ================= 特效 ================= */
const GOLD = ["#fff6c0", "#ffd36b", "#ff9f43", "#ffffff"];
const FIRE = ["#fff6c0", "#ffd36b", "#ff9a1f", "#ff5a1f", "#ff2d2d"];
const RAINBOW = ["#ff3d6e", "#ffcf3d", "#3dffb4", "#3dc8ff", "#b93dff", "#ffffff"];
const FESTIVE = ["#fff6c0", "#ffd36b", "#ff5a3a", "#ff2d6a", "#ffb020", "#ffffff"];
const CYAN = ["#e8fbff", "#3ee7ff", "#3d7bff", "#8b5cff"];
const CENTER = { x: 765, y: 520 };
function fxAdd(el, ms) { $("fx").appendChild(el); setTimeout(() => el.remove(), ms); return el; }
function big(text, cls, ms = 1900) { if (!G.live) return; const e = document.createElement("div"); e.className = "big " + cls; e.textContent = text; fxAdd(e, ms); }
function toast(text, cls = "") { if (!G.live) return; const e = document.createElement("div"); e.className = "toast " + cls; e.textContent = text; fxAdd(e, 2300); }
function petals(n) {
  if (!G.live || !FX.LV) return;
  for (let k = 0; k < Math.round(n * FX.AMT); k++) {
    const e = document.createElement("div"); e.className = "petal";
    e.style.cssText = `left:${Math.random() * 1920}px;--x:${(Math.random() - 0.5) * 400}px;--d:${2.5 + Math.random() * 2.5}s;animation-delay:${Math.random() * 1.2}s;background:${["#ff9ac8", "#ffc4de", "#ff6fae"][k % 3]}`;
    fxAdd(e, 6000);
  }
}
const later = (ms, fn) => setTimeout(() => { if (G.live) fn(); }, ms);
function playPos(i) { const el = $("played" + i); return FX.at(el.querySelector(".cards") || el); }
function seatPos(i) { return FX.at($("seat" + i).querySelector(".portrait")); }

function playedCards(i) { return $("played" + i).querySelector(".cards"); }
function rankCount(ranks) { const m = {}; ranks.forEach((r) => (m[r] = (m[r] || 0) + 1)); return m; }

/* ================= 大招特写 =================
 * 炸弹、王炸、报警、"大你" 时，把出牌人的立绘放大切到画面中间（见 cutin.js）。
 * 图片优先用 static/avatars/<id>-<场景>.png（自己画/生成的场景图），没有就用全身立绘 + 表情图里对应的表情做眼部特写。 */
const CUTIN_EXPR = { rocket: 6, bomb: 4, alarm: 9, beat: 7 };     // 大笑 / 生气（霸气）/ 兴奋 / 得意
const CUTIN_ON = Q.get("cutin") !== "0";
let lastBeatCutin = 0;
function cutinPrepare(name) {
  // 开局时预先处理图片，出炸弹时立刻就能用
  const p = prof(name);
  if (!p) return;
  if (p.avatar) artOf(name, p.avatar);
  if (p.faces && window.CUTIN) for (const k of Object.values(CUTIN_EXPR)) CUTIN.eyes(p.faces, k, p.cutin_eyes).catch(() => {});
  for (const u of Object.values(p.cutins || {})) { const i = new Image(); i.src = u; }
}
function cutinFor(d) {
  const scene = d.cutin;
  if (!scene || !G.live || !CUTIN_ON || !window.CUTIN) return 0;
  if (scene === "beat") {
    if (performance.now() - lastBeatCutin < 6000) return 0;    // "大你" 太密就不切
    lastBeatCutin = performance.now();
  }
  const s = G.seats[d.seat], p = prof(s.name);
  let art = "", artKind = p.art === "bust" ? "bust" : "full";
  const custom = (p.cutins || {})[scene];
  if (custom) { art = custom; artKind = "scene"; }
  else {
    const r = p.avatar && ART.get(p.avatar);
    art = r && r.ready && r.ready.full;
  }
  if (!art) return 0;                                           // 立绘还没处理好就不切，免得卡顿
  const eyes = p.faces ? CUTIN.eyesNow(p.faces, CUTIN_EXPR[scene], p.cutin_eyes) : "";
  const left = s.hand.length;
  const title = { rocket: "王炸", bomb: "炸弹", alarm: "报警", beat: "大你" }[scene];
  const sub = scene === "alarm" ? `${s.name} · 只剩 ${left} 张` : s.name;
  return CUTIN.play({
    tier: scene, side: $("seat" + d.seat).dataset.pos === "right" ? "right" : "left",
    art, artKind, eyes, color: colorOf(s.name), title: title + (scene === "beat" ? "！" : ""), sub, sfx,
  });
}

// 出牌特效：每种牌型对应一个动画；画面不震，只有炸弹爆炸时震一下
// cut：大招特写的时长，炸弹/王炸的爆炸动画等特写放完再开始
function fxPlay(d, cut = 0) {
  if (!G.live) return;
  const k = d.kind, el = playedCards(d.seat), p = playPos(d.seat), col = colorOf(G.seats[d.seat].name);
  sfx("slap");
  if (!el) return;
  if (k === "rocket") return cut ? later(cut - 220, () => fxRocket(p, true)) : fxRocket(p);
  if (k === "bomb") return cut ? later(cut - 220, () => fxBomb(p, true)) : fxBomb(p);
  if (k.startsWith("plane")) return fxPlane(d, el);
  if (k === "straight" || k === "pair_straight") return fxStraight(el, k);
  if (k.startsWith("four")) {
    COMBO.seal(el, k === "four_two_pair" ? "四带<br>两对" : "四带二", { sfx });
    return;
  }
  if (k.startsWith("trio")) {
    const cnt = rankCount(d.cards), trio = +Object.keys(cnt).find((r) => cnt[r] === 3);
    const sorted = s_played(d.seat), idx = sorted.map((c, i) => (c.r === trio ? i : -1)).filter((i) => i >= 0);
    const cards = [...el.querySelectorAll(".card")];
    COMBO.rings(idx.map((i) => cards[i]).filter(Boolean), { sfx });
    later(380 + 3 * 170, () => big(BIG_TEXT[k], "minor", 1100));
    return;
  }
  const bigCard = d.cards.some((r) => r >= 15);
  COMBO.glint(el, { big: bigCard });
  FX.ring(p.x, p.y, { c: col, vr: 700, w: 5, life: 0.4 });
  if (bigCard) later(300, () => sfx("big"));
}
function s_played(seat) { const s = G.seats[seat]; return Array.isArray(s.played) ? s.played.slice().sort(byAsc) : []; }

function fxBomb(p, quiet) {
  COMBO.bomb({ p, sfx, onBoom: (x, y) => {
    if (!G.live) return;
    FX.flash(`radial-gradient(circle at ${(x / 19.2).toFixed(1)}% ${(y / 10.8).toFixed(1)}%, #fff, rgba(255,150,40,.7) 30%, rgba(140,10,0,.35) 65%, transparent)`, 700);
    FX.glow(x, y, { size: 760, c: "rgba(255,210,130,1)", life: 0.5 });
    FX.glow(x, y, { size: 320, c: "rgba(255,255,255,1)", life: 0.25 });
    [["#ffffff", 2200, 26, 0], ["#ffb020", 1600, 18, 80], ["#ff3d2d", 1100, 12, 160]].forEach(([c, vr, w, dl]) => setTimeout(() => FX.ring(x, y, { c, vr, w, life: 0.7, vd: 0.94 }), dl));
    FX.burst(x, y, { n: 240, colors: FIRE, speed: [400, 1700], g: 700, len: [0.03, 0.07], w: [2, 5], life: [0.6, 1.3] });
    FX.debris(x, y, { n: 36, colors: ["#2a2e40", "#4a5068", "#ff5a1f", "#ffd25a"] });
    FX.smoke(x, y, { n: 22, c: "rgba(90,70,60,1)" });
    FX.embers(x, y, { n: 80, r: 170, colors: FIRE });
    FX.bgHit("hit-red", 1000);
    FX.thump(1);                // 全场唯一一次震屏
    if (!quiet) big("炸弹", "bomb", 1900);
    sfx("bomb");
    later(600, () => FX.embers(x, y, { n: 40, r: 240, colors: FIRE }));
  } });
}

function fxRocket(p, quiet) {
  COMBO.rocket({ p, sfx, onBoom: (x, y) => {
    if (!G.live) return;
    FX.flash("radial-gradient(circle at 40% 24%, #fff, rgba(255,200,80,.6) 30%, rgba(160,0,20,.3) 65%, transparent)", 800);
    FX.glow(x, y, { size: 900, c: "rgba(255,240,200,1)", life: 0.55 });
    FX.firework(x, y, FESTIVE, 1.6);
    FX.burst(x, y, { n: 220, colors: FESTIVE.concat(RAINBOW), speed: [400, 1800], g: 420, len: [0.03, 0.07], w: [2, 4], life: [0.8, 1.6] });
    ["#ffffff", "#ffd36b", "#ff5a3a"].forEach((c, i) => setTimeout(() => FX.ring(x, y, { c, vr: 2000 - i * 400, w: 18 - i * 4, life: 0.8, vd: 0.95 }), i * 100));
    FX.rays(x, y, "rgba(255,211,107,.55)", 2200);
    FX.bgHit("hit-rainbow", 1500);
    const jk = document.createElement("div"); jk.className = "jokers sz-xl";
    jk.innerHTML = cardHtml({ r: 16 }, 0) + cardHtml({ r: 17 }, 1);
    fxAdd(jk, 2300);
    if (!quiet) big("王炸", "rocket", 2300);
    sfx("rocket");
    for (let k = 0; k < 6; k++) {
      later(350 + k * 230, () => {
        const tx = FX.rnd(160, 1380), ty = FX.rnd(110, 380);
        FX.shell(FX.rnd(250, 1250), 1000, tx, ty, FX.rnd(0.45, 0.65), ["#ffd36b", "#ff9a1f"], (a, b) => { if (G.live) { FX.firework(a, b, [FX.pick(FESTIVE), FX.pick(RAINBOW), "#ffffff"]); sfx("pop"); } }, { thick: 1, size: 4, fall: 40 });
      });
    }
  } });
}

function fxPlane(d, el) {
  COMBO.plane({ sfx, onMid: () => {
    if (!G.live) return;
    big("飞机", "plane", 1500);
    [...el.querySelectorAll(".card")].forEach((c, i) => c.animate([{ transform: "none" }, { transform: "translateY(-22px) rotate(-4deg)" }, { transform: "none" }], { duration: 500, delay: i * 30, easing: "ease-out" }));
    const r = COMBO.rectOf(el);
    FX.glitter(r.x + r.w / 2, r.y, { n: 40, colors: ["#fff", "#bff6ff", "#ffd36b"], speed: [80, 360], g: 150 });
  } });
}

function fxStraight(el, k) {
  const pairs = k === "pair_straight";
  const cols = pairs ? ["#ffb3e0", "#ff5fb5", "#d9b8ff", "#9b6bff"] : ["#fff3b0", "#ffc23a", "#3ee7ff", "#2a8cff"];
  later(420, () => {
    const total = COMBO.wave(el, { pairs, cols, sfx });
    later(Math.min(total, 900), () => big(BIG_TEXT[k], k, 1400));
  });
}

function fxBid(d) {
  if (!G.live || !d.bid) return;
  const p = seatPos(d.seat);
  FX.ring(p.x, p.y, { c: "#ffd36b", vr: 500 + d.bid * 250, w: 4 + d.bid * 2, life: 0.5 });
  if (d.bid === 3) {
    FX.glitter(p.x, p.y, { n: 60, colors: GOLD, speed: [100, 500], g: 120 });
    big(`${G.seats[d.seat].name} 叫三分`, "lord", 1400);
  }
}

function fxLandlord(seat, name) {
  if (!G.live) return;
  const p = seatPos(seat);
  sfx("lord");
  FX.glow(p.x, p.y, { size: 420, c: "rgba(255,220,120,1)", life: 0.6 });
  FX.ring(p.x, p.y, { c: "#ffd36b", vr: 1200, w: 10, life: 0.7 });
  FX.glitter(p.x, p.y - 120, { n: 90, colors: GOLD, speed: [60, 420], g: 160, life: [1, 1.8] });
  FX.rays(p.x, p.y, "rgba(255,211,107,.5)", 2400);
  big(`${name} 成为地主`, "lord", 1800);
}

function fxAlarm(seat, left) {
  if (!G.live) return;
  const p = seatPos(seat), name = G.seats[seat].name;
  toast(`${name} 报警！只剩 ${left} 张`);
  FX.danger(true);
  FX.ring(p.x, p.y, { c: "#ff2d4a", vr: 800, w: 8, life: 0.7 });
  later(300, () => FX.ring(p.x, p.y, { c: "#ff2d4a", vr: 800, w: 8, life: 0.7 }));
  later(200, () => sfx("siren"));
}

function fxStart(no) {
  if (!G.live) return;
  big(`第 ${no} 局`, "start", 1300); sfx("start");
  later(1050, () => {
    big("开战", "fight", 1200);
    FX.ring(CENTER.x, CENTER.y, { c: "#ffd36b", vr: 1600, w: 12 });
    FX.glitter(CENTER.x, CENTER.y, { n: 80, colors: GOLD.concat("#ff4d6d"), speed: [150, 700], g: 200 });
    sfx("fight");
  });
}

// 背景里一直放的小烟花
function ambient() {
  setTimeout(ambient, 2600 + Math.random() * 3200);
  if (!G.live || FX.LV < 2 || document.hidden) return;
  const x0 = FX.rnd(80, 1450), tx = x0 + FX.rnd(-120, 120), ty = FX.rnd(60, 260);
  FX.shell(x0, 440, tx, ty, FX.rnd(0.7, 1.0), ["#ffd36b", "#ff9a1f"], (x, y) => FX.firework(x, y, [FX.pick(FESTIVE), FX.pick(RAINBOW), "#fff"], 0.35), { thick: 1, size: 3, fall: 40 });
}

/* ================= 音效（WebAudio 合成，无需素材） ================= */
const SFX = { on: localStorage.getItem("dd_sound") !== "off" };
function actx() { return FX.ctx(); }
function tone(f, dur, type = "sine", vol = 0.12, when = 0, to) {
  const c = actx(); if (!c) return;
  const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(FX.sfxOut()); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, when = 0, lp = 1000, sweepTo = 0, type = "lowpass") {
  const c = actx(); if (!c) return;
  const t = c.currentTime + when, buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / d.length, 2);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = type; f.frequency.setValueAtTime(lp, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  g.gain.value = vol;
  s.connect(f).connect(g).connect(FX.sfxOut()); s.start(t);
}
const arp = (fs, step, dur, type = "triangle", vol = 0.1, at = 0) => fs.forEach((f, i) => tone(f, dur, type, vol, at + i * step));
const SOUNDS = {
  slap: () => { noise(0.09, 1.0, 0, 1800, 500, "bandpass"); noise(0.03, 0.6, 0, 5000, 0, "highpass"); tone(150, 0.09, "sine", 0.4, 0, 60); },
  play: () => SOUNDS.slap(),
  deal: () => { for (let k = 0; k < 17; k++) noise(0.03, 0.45, k * 0.034, 4200, 0, "highpass"); },
  heavy: () => { SOUNDS.slap(); tone(220, 0.16, "square", 0.1, 0.02, 110); noise(0.14, 0.4, 0.02, 1600); },
  big: () => { arp([880, 1320, 1760], 0.04, 0.12, "square", 0.06); noise(0.15, 0.3, 0, 2500); },
  pass: () => { tone(200, 0.07, "sine", 0.16); tone(170, 0.07, "sine", 0.14, 0.12); },
  bid: () => { tone(660, 0.1, "triangle", 0.12); tone(990, 0.14, "triangle", 0.1, 0.08); },
  combo: () => arp([523, 659, 784, 1047, 1319], 0.05, 0.14, "square", 0.06),
  swoosh: () => noise(0.45, 0.45, 0, 400, 6000, "bandpass"),
  charge: () => tone(180, 0.2, "sawtooth", 0.14, 0, 1100),
  boom: () => { noise(0.5, 0.6, 0, 900); tone(90, 0.4, "sine", 0.4, 0, 35); },
  bomb: () => { noise(1.1, 1, 0, 1200, 120); tone(110, 0.8, "sawtooth", 0.35, 0, 28); tone(55, 1.1, "sine", 0.6, 0, 22); noise(0.6, 0.4, 0.15, 500); },
  launch: () => { noise(0.5, 0.5, 0, 500, 7000, "bandpass"); tone(300, 0.5, "sawtooth", 0.1, 0, 2200); },
  rocket: () => { noise(1.5, 1, 0, 2000, 100); tone(80, 1.2, "sawtooth", 0.4, 0, 25); tone(45, 1.5, "sine", 0.7, 0, 20); arp([784, 988, 1175, 1568, 1976], 0.07, 0.2, "square", 0.06, 0.15); },
  pop: () => { noise(0.3, 0.6, 0, 2600); for (let k = 0; k < 6; k++) noise(0.03, 0.2, 0.1 + k * 0.045, 7000, 0, "highpass"); },
  jet: () => { noise(0.9, 0.35, 0, 300, 3000, "bandpass"); noise(1.1, 0.45, 0.8, 3000, 250, "bandpass"); tone(320, 0.9, "sawtooth", 0.05, 0, 520); tone(520, 1.1, "sawtooth", 0.05, 0.8, 260); },
  whistle: () => tone(1900, 0.42, "sine", 0.1, 0, 520),
  thud: () => { tone(120, 0.18, "sine", 0.5, 0, 50); noise(0.12, 0.5, 0, 800); },
  fuse: () => { noise(0.65, 0.35, 0, 6000, 3000, "highpass"); for (let k = 0; k < 10; k++) noise(0.02, 0.25, k * 0.06, 8000, 0, "highpass"); },
  ignite: () => { noise(0.8, 0.5, 0, 260, 900); tone(60, 0.8, "sawtooth", 0.12, 0, 90); },
  note: (k = 0) => { const sc = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349]; const f = sc[Math.min(k, sc.length - 1)]; tone(f, 0.22, "triangle", 0.11); tone(f * 2, 0.12, "sine", 0.04); },
  chime: (k = 0) => { const f = [880, 1109, 1319][k % 3]; tone(f, 0.6, "sine", 0.14); tone(f * 2.76, 0.3, "sine", 0.04); tone(f * 5.4, 0.15, "sine", 0.02); },
  stamp: () => { tone(90, 0.25, "sine", 0.6, 0, 45); noise(0.15, 0.7, 0, 900); tone(196, 1.4, "sine", 0.1, 0.05); tone(392, 1.0, "sine", 0.05, 0.05); },
  thunder: () => { noise(1, 0.9, 0, 3000, 150); tone(70, 0.8, "sawtooth", 0.3, 0, 28); },
  fight: () => { arp([392, 523, 659, 1047], 0.05, 0.3, "square", 0.08); noise(0.4, 0.5, 0, 1500); tone(60, 0.5, "sine", 0.5, 0, 30); },
  siren: () => { for (let k = 0; k < 3; k++) { tone(880, 0.18, "square", 0.07, k * 0.36, 1320); tone(1320, 0.18, "square", 0.07, k * 0.36 + 0.18, 880); } },
  lord: () => arp([392, 523, 659, 784, 1047], 0.08, 0.22, "triangle", 0.12),
  win: () => arp([523, 659, 784, 1047, 1319, 1568], 0.1, 0.3, "triangle", 0.12),
  out: () => { tone(420, 0.6, "sawtooth", 0.14, 0, 70); noise(0.5, 0.6, 0, 900, 100); tone(50, 0.6, "sine", 0.5, 0, 25); },
  next: () => { arp([440, 554, 659, 880, 1109], 0.06, 0.16, "square", 0.06); noise(0.5, 0.3, 0, 500, 6000, "bandpass"); },
  start: () => { arp([330, 440, 554], 0.1, 0.18, "triangle", 0.1); noise(0.8, 0.3, 0, 300, 5000, "bandpass"); },
};
function sfx(name, arg) { if (G.live && SFX.on && SOUNDS[name]) { try { SOUNDS[name](arg); } catch (e) { /* 忽略 */ } } }

/* ================= 选手语音 =================
 * 后端给每手牌一组片段 clips：[{text, url?, sim?, duration}]
 *   有 url：播放真实接口合成的音频（HeyGen / 自定义接口）
 *   sim：本地模拟，用浏览器自带中文语音念，按选手的 voice_sim 调音高、语速 */
const VOICE = { on: localStorage.getItem("dd_voice") !== "off", q: [], cur: null, zh: [], tm: null };
const TTS_OK = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
function loadVoices() { try { VOICE.zh = speechSynthesis.getVoices().filter((v) => /^(zh|cmn)/i.test(v.lang)); } catch (e) { VOICE.zh = []; } }
if (TTS_OK) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(sim) {
  if (!VOICE.zh.length) return null;
  if (sim.voice) {
    try { const re = new RegExp(sim.voice, "i"); const v = VOICE.zh.find((x) => re.test(x.name)); if (v) return v; } catch (e) { /* 正则写错就用默认 */ }
  }
  return VOICE.zh.find((x) => /zh-CN/i.test(x.lang)) || VOICE.zh[0];
}
function stopVoice() {
  VOICE.q = []; const c = VOICE.cur; VOICE.cur = null; clearTimeout(VOICE.tm);
  if (c && c.pause) c.pause();
  if (TTS_OK) speechSynthesis.cancel();
  l2dStopAll();
}
function speakClips(name, clips) {
  if (!G.live || !VOICE.on || !clips || !clips.length) return;
  stopVoice();   // 后端已经按语音时长控制节奏，新的一手来了就不再念旧的
  VOICE.q = clips.map((c) => ({ ...c, name }));
  nextClip();
}
function nextClip() {
  clearTimeout(VOICE.tm);
  const c = VOICE.q.shift();
  if (!c) { VOICE.cur = null; FX.duck(false); return; }
  FX.duck(true);
  const done = (me) => () => { if (VOICE.cur === me) nextClip(); };
  const lc = l2dCtrlByName(c.name);   // 这个角色是 Live2D 的话，跟着语音动嘴
  if (c.url) {
    const a = new Audio(c.url); VOICE.cur = a;
    const fin = done(a), end = () => { if (lc) lc.stopSpeaking(); fin(); };
    if (lc) lc.startSpeaking({ audio: a, text: c.text, duration: c.duration });
    a.onended = a.onerror = end;
    const p = a.play(); if (p && p.catch) p.catch(end);
  } else if (c.sim && TTS_OK) {
    const sim = prof(c.name).voice_sim || {};
    const u = new SpeechSynthesisUtterance(c.text);
    u.lang = "zh-CN"; const v = pickVoice(sim); if (v) u.voice = v;
    u.pitch = clamp(+sim.pitch || 1, 0, 2); u.rate = clamp(+sim.rate || 1, 0.5, 2); u.volume = 1;
    const fin = done(u), end = () => { if (lc) lc.stopSpeaking(); fin(); };
    VOICE.cur = u; u.onend = u.onerror = end;
    if (lc) lc.startSpeaking({ text: c.text, duration: c.duration || c.text.length * 0.25 });   // 语音合成拿不到音频数据，按文字估算口型
    speechSynthesis.speak(u);
    VOICE.tm = setTimeout(end, ((c.duration || 2) + 1.5) * 1000);   // 有的浏览器不触发 onend
  } else nextClip();
}

function initSoundBtn() {
  const b = $("sound"), m = $("bgm"), v = $("voice");
  const paint = () => {
    v.textContent = VOICE.on ? "语音 开" : "语音 关"; v.classList.toggle("off", !VOICE.on);
    b.textContent = SFX.on ? "音效 开" : "音效 关"; b.classList.toggle("off", !SFX.on);
    m.textContent = FX.BGM.on ? "音乐 开" : "音乐 关"; m.classList.toggle("off", !FX.BGM.on);
  };
  b.onclick = () => { SFX.on = !SFX.on; localStorage.setItem("dd_sound", SFX.on ? "on" : "off"); if (SFX.on) actx(); paint(); };
  m.onclick = () => { FX.bgmToggle(); paint(); };
  v.onclick = () => { VOICE.on = !VOICE.on; localStorage.setItem("dd_voice", VOICE.on ? "on" : "off"); if (!VOICE.on) stopVoice(); paint(); };
  paint();
}

/* ================= 结算画面 ================= */
async function showResult(d) {
  const seq = ++G.endSeq;
  const names = G.seats.map((s) => s.name);
  const ov = $("overlay");
  const lordWin = d.winner_side === "地主";
  const loserIdx = names.indexOf(d.loser);
  const cards = names.map((n, i) => {
    const role = d.roles[i], win = role === d.winner_side;
    const delta = d.deltas ? d.deltas[i] : (win ? 1 : -1) * d.multiplier * (role === "地主" ? 2 : 1);
    return `<div class="rc${win ? " win" : ""}${i === loserIdx ? " loser" : ""}${role === "地主" ? " landlord" : ""}" style="--i:${i};${pcVars(n)}">
      ${mini(n)}
      <div class="nm">${esc(n)}</div>
      <div class="rl"><span class="role ${role === "地主" ? "dz" : "nm"}"><span>${role}</span></span></div>
      <div class="delta ${delta > 0 ? "pos" : "neg"}">${delta > 0 ? "+" : ""}${num(delta)}</div>
      <div class="left">剩余 ${d.hands_left[i].length} 张</div>
    </div>`;
  }).join("");
  const sub = [`倍数 <b>×${d.multiplier}</b>`];
  if (d.bombs) sub.push(`炸弹 <b>${d.bombs}</b> 个`);
  if (d.spring) sub.push(`<b>${lordWin ? "春天" : "反春"}</b>`);
  ov.innerHTML = `<div class="res-title${lordWin ? "" : " farmer"}">${lordWin ? "地主胜利" : "农民胜利"}</div>
    <div class="res-sub">${sub.join(" · ")}</div>
    <div class="res-cards">${cards}</div>
    <div class="res-reason"></div><div id="resNext"></div>`;
  ov.classList.add("show");

  const stampLoser = () => {
    const rc = ov.querySelectorAll(".rc")[loserIdx];
    if (rc) { rc.classList.add("stamped"); rc.insertAdjacentHTML("beforeend", `<div class="stamp">淘汰</div>`); }
    ov.querySelector(".res-reason").textContent = `${d.loser} 下场 · ${d.reason}`;
    return rc;
  };
  const showNext = () => {
    if (!d.newcomer) return null;
    $("resNext").innerHTML = `<div class="res-next" style="${pcVars(d.newcomer)}">${mini(d.newcomer)}<div><small>挑战者登场</small>${esc(d.newcomer)}</div></div>`;
    return $("resNext").firstElementChild;
  };
  if (!G.live) { stampLoser(); showNext(); return; }

  const winCols = lordWin ? GOLD : ["#cfe4ff", "#6fb0ff", "#ffffff", "#ffd36b"];
  sfx("win");
  FX.flash("rgba(255,255,255,.4)", 400);
  FX.confetti(0, 1080, { dir: -1.0, spread: 0.7, n: 180 });
  FX.confetti(1920, 1080, { dir: -2.14, spread: 0.7, n: 180 });
  for (let k = 0; k < 6; k++) later(150 + k * 260, () => { FX.firework(FX.rnd(300, 1620), FX.rnd(130, 380), winCols); sfx("pop"); });
  later(500, () => FX.rain({ n: 120 }));
  if (d.spring) later(300, () => { big(lordWin ? "春天" : "反春", "spring", 2200); petals(90); });

  await wait(1700); if (seq !== G.endSeq) return;
  const rc = stampLoser(); sfx("out");
  if (rc) {
    const p = FX.at(rc);
    FX.flash("radial-gradient(circle, rgba(255,30,60,.55), transparent 70%)", 600);
    FX.ring(p.x, p.y, { c: "#ff2d4a", vr: 1800, w: 20, life: 0.7 });
    FX.burst(p.x, p.y, { n: 50, colors: ["#ff2d4a", "#ff8095", "#ffffff"], speed: [200, 700], g: 400 });
  }
  await wait(1500); if (seq !== G.endSeq) return;
  const nx = showNext();
  if (nx) {
    sfx("next");
    const p = FX.at(nx);
    FX.beam(p.x, p.y, "rgba(62,231,255,.8)", 1500);
    FX.ring(p.x, p.y, { c: "#3ee7ff", vr: 1400, w: 14 });
    FX.burst(p.x, p.y, { n: 110, colors: CYAN, speed: [300, 1200], g: 200 });
    FX.glitter(p.x, p.y, { n: 60, colors: CYAN });
  }
}
function showChampion(d) {
  const ov = $("overlay");
  ov.innerHTML = `<div class="res-title">最终赢家</div><div class="res-sub">擂台赛结束</div>
    <div class="res-cards">${d.names.map((n, i) => `<div class="rc win" style="--i:${i};${pcVars(n)}">${mini(n)}<div class="nm">${esc(n)}</div></div>`).join("")}</div>`;
  ov.classList.add("show");
  if (!G.live) return;
  sfx("win");
  for (let k = 0; k < 12; k++) later(k * 250, () => { FX.firework(FX.rnd(200, 1720), FX.rnd(120, 500), RAINBOW); sfx("pop"); });
  FX.confetti(0, 1080, { dir: -1.0, n: 250 }); FX.confetti(1920, 1080, { dir: -2.14, n: 250 }); FX.rain({ n: 200 });
}

/* ================= 事件处理 ================= */
function resyncHand(i, ranks) {
  // 后端手牌和前端不一致时以后端为准
  const s = G.seats[i];
  if (s.hand.length === ranks.length) return;
  const pool = s.hand.slice(); s.hand = [];
  for (const r of ranks) { const k = pool.findIndex((c) => c.r === r); s.hand.push(k >= 0 ? pool.splice(k, 1)[0] : { r, s: Math.max(0, takeSuit(r)) }); }
}
function farmersOf(seat) { return [0, 1, 2].filter((i) => G.roles[i] === "农民" && i !== seat).map((i) => G.seats[i].name); }

const H = {
  synced() { G.live = true; FX.bgmStart(); },

  game_start(d) {
    G.endSeq++; $("overlay").classList.remove("show");
    G.snap = d; G.profiles = d.profiles || G.profiles; G.gameNo = d.game_no;
    G.bid = 0; G.mult = 1; G.landlord = -1; G.turn = -1; G.roles = [null, null, null];
    d.table.forEach((n, i) => Object.assign(G.seats[i], { name: n, hand: [], played: null, thinking: false, alarmed: false }));
    for (let i = 0; i < 3; i++) { buildSeat(i); renderPlayed(i); showClock(i, false); setExpr(i, 0, 0); cutinPrepare(G.seats[i].name); }
    l2dRetain();
    hideBubbles(); stopVoice(); setPhase("叫地主"); setHint("");
    $("bottom").innerHTML = cardsHtml([{ back: 1 }, { back: 1 }, { back: 1 }], 3, "sz-xs");
    renderBoard(d, false); renderAllSeats();
    $("feed").innerHTML = "";
    feed(null, `第 ${d.game_no} 局开始：${d.table.join(" / ")}`);
    ticker(`第 ${d.game_no} 局开战！输的人要下场，谁会被淘汰？`);
    FX.danger(false); fxStart(d.game_no);
  },

  deal(d) {
    G.used = {};
    d.hands.forEach((h, i) => { G.seats[i].hand = toCards(h); renderHand(i, true); });
    renderAllSeats(); sfx("deal");
  },

  redeal(d) { toast(d.reason, "blue"); feed(null, d.reason); },

  turn(d) {
    const s = G.seats[d.seat];
    G.turn = d.seat; s.thinking = true; s.t0 = performance.now();
    setExpr(d.seat, "think", 0);
    if (d.phase === "play") { s.played = null; renderPlayed(d.seat); }
    bubble(d.seat, "", "");
    for (let i = 0; i < 3; i++) showClock(i, i === d.seat);
    setHint(d.phase === "bid" ? `${s.name} 正在考虑叫分…` : d.lead ? `${s.name} 首家出牌` : `轮到 ${s.name}`);
    feedThinking(s.name, d.phase === "bid" ? "考虑叫分" : "思考中");
    renderAllSeats();
  },

  bid(d) {
    const s = G.seats[d.seat]; s.thinking = false; showClock(d.seat, false);
    const { warn, text } = splitSay(d.say);
    const what = d.bid ? `叫${d.call || d.bid + "分"}` : "不叫";
    bubble(d.seat, `<b class="bid">${what}</b>`, text, warn);
    feed(s.name, what, { say: text, pass: !d.bid });
    if (d.bid) { G.bid = d.bid; setTop(); }
    sfx(d.bid ? "bid" : "pass"); renderAllSeats(); fxBid(d);
    setExpr(d.seat, d.bid === 3 ? "hype" : d.bid ? "happy" : "calm"); speakClips(s.name, d.clips);
  },

  landlord(d) {
    G.landlord = d.seat; G.roles = d.roles; G.bid = d.bid; G.mult = d.bid; setTop();
    G.bottom = toCards(d.bottom);
    $("bottom").innerHTML = cardsHtml(G.bottom, 3, "sz-xs").replace(/class="card/g, `class="${G.live ? "flip " : ""}card`);
    const s = G.seats[d.seat];
    s.hand = s.hand.concat(G.bottom.map((c) => ({ ...c })));
    for (let i = 0; i < 3; i++) { resyncHand(i, d.hands[i]); renderHand(i, false); }
    hideBubbles(); setPhase("对局进行中"); setHint("");
    renderAllSeats();
    feed(null, `${s.name} 成为地主，底牌 ${fmtRanks(d.bottom)}`);
    ticker(`${s.name} 抢到地主！${farmersOf(d.seat).join("、")} 联手能否掀翻？`, true);
    fxLandlord(d.seat, s.name);
    setExpr(d.seat, "laugh", 3000); others(d.seat).forEach((j) => setExpr(j, "angry", 2400));
    l2dAct(d.seat, "nod");
  },

  play(d) {
    const s = G.seats[d.seat]; s.thinking = false; showClock(d.seat, false);
    if (d.cards.length) {
      const out = [];
      for (const r of d.cards) { const k = s.hand.findIndex((c) => c.r === r); out.push(k >= 0 ? s.hand.splice(k, 1)[0] : { r, s: Math.max(0, takeSuit(r)) }); }
      s.played = out; s.label = d.type; s.kind = d.kind; s.hot = d.kind === "bomb" || d.kind === "rocket";
    } else { s.played = "pass"; s.kind = "pass"; }
    resyncHand(d.seat, d.hands[d.seat]);
    renderHand(d.seat, false); renderPlayed(d.seat, true);

    const { warn, text } = splitSay(d.say);
    if (text) bubble(d.seat, "", text, warn);
    if (d.cards.length) {
      const act = d.kind === "rocket" ? "王炸!(双王)" : d.kind === "bomb" ? "炸弹!" : "出牌:";
      feed(s.name, act, { chips: chipsHtml(s.played), say: text, hot: s.hot });
      fxPlay(d, cutinFor(d));
      if (d.kind === "rocket") ticker(`全场震撼！${s.name} 王炸！${G.roles[d.seat] === "地主" ? "农民" : "地主"}能否顶住？！`, true);
      else if (d.kind === "bomb") ticker(`${s.name} 一个炸弹砸下来！倍数翻到 ×${d.multiplier}`, true);
      else if (d.kind.startsWith("plane")) ticker(`${s.name} 飞机起飞！手牌一下少了一大截`);
      else if (d.kind === "straight" || d.kind === "pair_straight") ticker(`${s.name} 打出${d.type}，节奏拉满`);
    } else { feed(s.name, d.call || "不要", { say: text, pass: true }); sfx("pass"); }

    speakClips(s.name, d.clips);
    exprPlay(d);
    if (d.multiplier) setMult(d.multiplier);
    const left = s.hand.length;
    if (left > 0 && left <= 2 && !s.alarmed) {
      s.alarmed = true; fxAlarm(d.seat, left); if (!G.live) FX.danger(true);
      ticker(`${s.name} 报警！只剩 ${left} 张牌！`, true);
      setExpr(d.seat, "smug", 3000);
      others(d.seat).forEach((j) => { if (G.roles[j] !== G.roles[d.seat]) setExpr(j, "shock", 2400); });
    }
    G.turn = -1; setHint("");
    renderAllSeats();
  },

  new_round() {
    for (let i = 0; i < 3; i++) { G.seats[i].played = null; renderPlayed(i); }
  },

  game_end(d) {
    G.seats.forEach((s) => (s.thinking = false)); G.turn = -1; FX.danger(false);
    for (let i = 0; i < 3; i++) showClock(i, false);
    dropThinking();
    d.roles.forEach((r, i) => setExpr(i, G.seats[i].name === d.loser ? "sad" : r === d.winner_side ? "laugh" : "angry", 0));
    d.roles.forEach((r, i) => { if (G.seats[i].name === d.loser) l2dAct(i, "lowerHead"); });
    d.hands_left.forEach((h, i) => { resyncHand(i, h); renderHand(i, false); });
    G.snap = d; G.profiles = d.profiles || G.profiles;
    renderAllSeats(); renderBoard(d, true); setPhase("结算"); setHint("");
    feed(null, `${d.winner_side}胜利 · ${d.loser} 下场${d.newcomer ? ` · ${d.newcomer} 上场` : ""}`);
    ticker(`${d.winner_side}胜利！${d.loser} 被淘汰${d.newcomer ? `，${d.newcomer} 挑战登场` : ""}`, true);
    showResult(d);
  },

  champion(d) { showChampion(d); },

  demo_progress(d) {
    let el = $("demoPill");
    if (!el) {
      el = document.createElement("div"); el.id = "demoPill"; el.className = "demo-pill";
      $("controls").prepend(el);
    }
    el.innerHTML = `<label>演示 · 第 ${d.round} 轮</label><b>牌型 ${d.shown}/${d.total}</b>`;
    el.title = d.missing.length ? "还没出：" + d.missing.join("、") : "全部牌型已展示";
    el.classList.toggle("done", !!d.complete);
    if (!d.type) return;
    feed(null, `新牌型：${d.type}（${d.shown}/${d.total}）` + (d.complete ? " · 全部展示完毕" : ""));
    if (d.complete) toast("14 种牌型全部展示完毕", "blue");
  },
};

function handle(ev) {
  const fn = H[ev.type];
  if (!fn) return;
  try { fn(ev.data || {}); } catch (e) { console.error("处理事件出错", ev.type, e); }
}

/* ================= 思考计时 ================= */
setInterval(() => {
  G.seats.forEach((s, i) => {
    if (!s.thinking) return;
    const sec = (performance.now() - s.t0) / 1000;
    const c = $("clock" + i); c.querySelector("b").textContent = Math.floor(sec);
    c.classList.toggle("slow", sec >= 15);
    const t = $("thinkRow"); if (t && i === G.turn) t.querySelector(".tm").textContent = sec.toFixed(1) + "s";
  });
}, 100);

/* ================= 缩放 / 连接 ================= */
function fit() {
  const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  $("stage").style.transform = `scale(${k})`;
}
window.addEventListener("resize", fit);

function connect() {
  if (location.protocol === "file:") return;
  const es = new EventSource("events");
  es.onopen = () => { G.live = false; };   // 断线重连时先静默回放，收到 synced 再开特效
  es.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
}

if (Q.get("controls") === "1") document.body.classList.add("show-controls");
FX.init(); buildScene();
for (let i = 0; i < 3; i++) buildSeat(i);
setTop(); ticker("等待开局…");
fit(); initSoundBtn(); connect(); setTimeout(ambient, 1500);
window.DD = { handle, G };
})();
