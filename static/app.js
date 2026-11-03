(() => {
"use strict";

/* ================= 常量 ================= */
const NAMES = { 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "小王", 17: "大王" };
const suit = (s) => `<svg class="su"><use href="#su${s}"/></svg>`;
const STAR = `<svg class="su"><use href="#star"/></svg>`;
const PALETTE = ["#4f8cff", "#ff5f7e", "#2fd3a0", "#a66bff", "#ffb020", "#ff6fb5", "#22c1ee", "#8bd448", "#ff8a4c", "#7a7dff"];
const PER_ROW = [10, 10, 20];
const COMBO_TEXT = { bomb: "炸弹", rocket: "王炸", plane: "飞机", plane_single: "飞机", plane_pair: "飞机", straight: "顺子", pair_straight: "连对" };
const CROWN = `<svg class="crown" viewBox="0 0 64 44"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#ffc83d"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs><path d="M4 14 L18 26 L32 4 L46 26 L60 14 L54 40 L10 40 Z" fill="url(#cg)" stroke="#a85a00" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="4" r="4" fill="#ff4d6d"/><circle cx="4" cy="14" r="3.5" fill="#3ee7ff"/><circle cx="60" cy="14" r="3.5" fill="#3ee7ff"/><rect x="10" y="33" width="44" height="7" fill="#ffdd6b" opacity=".7"/></svg>`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= 状态 ================= */
const G = {
  live: false, profiles: {}, snap: null, gameNo: 0, bid: 0, mult: 1, landlord: -1,
  roles: [null, null, null], bottom: [], used: {}, turn: -1, endSeq: 0,
  seats: [0, 1, 2].map(() => ({ name: "", hand: [], played: null, label: "", hot: false, thinking: false, t0: 0, alarmed: false, typing: null })),
};

/* ================= 颜色 / 头像 ================= */
function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
function colorOf(name) { return (G.profiles[name] && G.profiles[name].color) || PALETTE[hash(name) % PALETTE.length]; }
function hexRgb(hex) { const m = hex.replace("#", ""); const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function pcVars(name) {
  let [r, g, b] = [79, 140, 255];
  try { [r, g, b] = hexRgb(colorOf(name)); } catch (e) { /* 非法颜色用默认 */ }
  const d = (x) => Math.round(x * 0.45);
  return `--pc:rgb(${r},${g},${b});--pc2:rgb(${d(r)},${d(g)},${d(b)});--pcg:rgba(${r},${g},${b},.6)`;
}
function initial(name) { const s = String(name || "?").trim(); return esc(Array.from(s)[0] || "?").toUpperCase(); }
function faceHtml(name) {
  const av = G.profiles[name] && G.profiles[name].avatar;
  return av ? `<img src="${esc(av)}" alt="">` : initial(name);
}
function avatarHtml(name) {
  return `<div class="avatar" style="${pcVars(name)}"><div class="ring"></div><div class="face">${faceHtml(name)}</div>${CROWN}</div>`;
}
function miniAv(name) { return `<div class="mini-av" style="${pcVars(name)}">${faceHtml(name)}</div>`; }
function modelOf(name) { return (G.profiles[name] && G.profiles[name].model) || ""; }

/* ================= 扑克牌 ================= */
function takeSuit(r) { if (r >= 16) return -1; const i = G.used[r] || 0; G.used[r] = i + 1; return i % 4; }
function toCards(ranks) { return ranks.map((r) => ({ r, s: takeSuit(r) })); }
const byDesc = (a, b) => b.r - a.r || a.s - b.s;
const byAsc = (a, b) => a.r - b.r || a.s - b.s;

function cardHtml(c, i) {
  if (c.back) return `<div class="card back" style="--i:${i}"></div>`;
  if (c.r >= 16) {
    const col = c.r === 17 ? "red" : "black";
    return `<div class="card joker ${col}" style="--i:${i}"><div class="cr"><b>J<br>O<br>K<br>E<br>R</b></div><div class="cc">${STAR}</div></div>`;
  }
  const red = c.s === 1 || c.s === 3;
  return `<div class="card${red ? " red" : ""}" style="--i:${i}"><div class="cr"><b${c.r === 10 ? ' class="ten"' : ""}>${NAMES[c.r]}</b><i>${suit(c.s)}</i></div><div class="cc">${suit(c.s)}</div></div>`;
}
function cardsHtml(cards, perRow, cls = "") {
  let html = `<div class="cards ${cls}">`, i = 0;
  for (let k = 0; k < cards.length; k += perRow) {
    html += `<div class="row">` + cards.slice(k, k + perRow).map((c) => cardHtml(c, i++)).join("") + `</div>`;
  }
  return html + `</div>`;
}
function fmtRanks(ranks) { return ranks.length ? ranks.slice().sort((a, b) => a - b).map((r) => NAMES[r]).join(" ") : "不要"; }

/* ================= 座位 ================= */
function buildSeat(i) {
  const s = G.seats[i], el = $("seat" + i);
  el.style.cssText = pcVars(s.name);
  el.innerHTML = `
    <div class="info">
      ${avatarHtml(s.name)}
      <div class="meta"><div class="name">${esc(s.name || "等待入座")}</div><div class="model">${esc(modelOf(s.name))}</div><div class="tags"></div></div>
      <div class="count"><b>0</b><span>剩余</span></div>
      <div class="think"><i></i><i></i><i></i><span>思考中</span></div>
    </div>
    <div class="hand"></div>`;
}
function updateSeat(i) {
  const s = G.seats[i], el = $("seat" + i);
  const role = G.roles[i];
  el.classList.toggle("turn", G.turn === i);
  el.classList.toggle("thinking", s.thinking);
  el.classList.toggle("landlord", role === "地主");
  el.classList.toggle("alarm", s.hand.length > 0 && s.hand.length <= 2 && role !== null);
  const st = G.snap && G.snap.stats && G.snap.stats[s.name];
  let tags = "";
  if (role === "地主") tags += `<span class="tag dz">地主</span>`;
  else if (role === "农民") tags += `<span class="tag nm">农民</span>`;
  else if (s.name) tags += `<span class="tag status">叫分阶段</span>`;
  if (st && st.streak >= 2) tags += `<span class="tag streak">${st.streak} 连胜</span>`;
  const t = el.querySelector(".tags"); if (t) t.innerHTML = tags;
  const c = el.querySelector(".count b"); if (c) c.textContent = s.hand.length;
}
function renderHand(i, anim) {
  const s = G.seats[i];
  const h = $("seat" + i).querySelector(".hand");
  if (h) h.innerHTML = cardsHtml(s.hand.slice().sort(byDesc), PER_ROW[i], anim && G.live ? "deal" : "");
}
function renderPlayed(i, anim) {
  const s = G.seats[i], el = $("played" + i);
  if (s.played === null) { el.innerHTML = ""; return; }
  if (s.played === "pass") { el.innerHTML = `<div class="pass">不要</div>`; return; }
  el.innerHTML = `<div class="label${s.hot ? " hot" : ""}">${esc(s.label)}</div>` +
    cardsHtml(s.played.slice().sort(byAsc), PER_ROW[i], anim && G.live ? "in" : "");
}
function renderAllSeats() { for (let i = 0; i < 3; i++) { updateSeat(i); } }

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

/* ================= 顶栏 / 侧栏 ================= */
function setTop() {
  $("gameNo").textContent = G.gameNo ? "#" + G.gameNo : "-";
  $("bid").textContent = G.bid || "-";
  $("mult").textContent = "×" + G.mult;
}
function setMult(m) {
  if (m === G.mult) return;
  const up = m > G.mult, no = G.gameNo; G.mult = m;
  const pill = document.querySelector(".pill.mult");
  const land = () => {
    if (no !== G.gameNo) return;
    setTop(); pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
    if (G.live && up) {
      const q = FX.at(pill);
      FX.burst(q.x, q.y, { n: 60, colors: ["#fff6c0", "#ffd36b", "#ff9f43"], speed: [200, 800], g: 400 });
      FX.ring(q.x, q.y, { c: "#ffd36b", vr: 800, w: 10, life: 0.5 }); FX.shake(0.25); sfx("big");
    }
  };
  if (!G.live || !up) return land();
  setTimeout(() => { if (G.live) FX.fly(`×${m}`, { x: 740, y: 560 }, FX.at(pill), 700, "mult", land); else land(); }, 1100);
}
function setPhase(t) { $("phase").textContent = t; }
function setHint(t) { $("turnHint").textContent = t || ""; }

function renderBoard(snap) {
  if (!snap) return;
  const onTable = new Set(snap.table || []);
  const rows = Object.entries(snap.stats || {}).sort((a, b) => b[1].score - a[1].score || b[1].wins - a[1].wins).slice(0, 8);
  $("rank").innerHTML = rows.map(([n, s], idx) => `
    <div class="rk${onTable.has(n) ? " on" : ""}">
      <div class="no">${idx + 1}</div>${miniAv(n)}
      <div class="nm">${esc(n)}<small>${esc(modelOf(n)) || "&nbsp;"}</small></div>
      <div class="st">${s.wins}胜${s.losses}负<br>${s.streak >= 2 ? `<b>${s.streak}连胜</b>` : `最高${s.best_streak}连`}</div>
      <div class="sc ${s.score > 0 ? "pos" : s.score < 0 ? "neg" : ""}">${s.score > 0 ? "+" : ""}${s.score}</div>
    </div>`).join("");
  const q = snap.queue || [], out = snap.out || [];
  $("queue").innerHTML = (q.length ? q.map((n, i) => `<div class="q${i === 0 ? " next" : ""}">${miniAv(n)}<span>${esc(n)}</span><span class="idx">${i === 0 ? "下一位" : "#" + (i + 1)}</span></div>`).join("") : `<div class="empty">暂无挑战者</div>`) +
    out.map((n) => `<div class="q gone">${miniAv(n)}<span>${esc(n)}</span></div>`).join("");
}
function feed(name, act, opts = {}) {
  const f = $("feed");
  const d = document.createElement("div");
  if (!name) { d.className = "fi sys"; d.textContent = act; }
  else {
    d.className = "fi";
    const actCls = opts.hot ? "act hot" : opts.pass ? "act pass" : "act";
    d.innerHTML = `${miniAv(name)}<div class="body"><span class="who">${esc(name)}</span><span class="${actCls}">${esc(act)}</span>` +
      (opts.cards ? `<span class="cs">${esc(opts.cards)}</span>` : "") +
      (opts.say ? `<span class="say">${esc(opts.say)}</span>` : "") + `</div>`;
  }
  f.prepend(d);
  while (f.children.length > 40) f.lastChild.remove();
}

/* ================= 特效 ================= */
const GOLD = ["#fff6c0", "#ffd36b", "#ff9f43", "#ffffff"];
const FIRE = ["#fff6c0", "#ffd36b", "#ff9a1f", "#ff5a1f", "#ff2d2d"];
const RAINBOW = ["#ff3d6e", "#ffcf3d", "#3dffb4", "#3dc8ff", "#b93dff", "#ffffff"];
const CYAN = ["#e8fbff", "#3ee7ff", "#3d7bff", "#8b5cff"];
const CENTER = { x: 740, y: 470 };
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
function seatPos(i) { return FX.at($("seat" + i).querySelector(".avatar")); }

function fxPlay(d) {
  if (!G.live) return;
  const k = d.kind, p = playPos(d.seat), col = colorOf(G.seats[d.seat].name);
  if (k === "rocket") return fxRocket(p);
  if (k === "bomb") return fxBomb(p);
  if (k.startsWith("plane")) return fxPlane(p);
  if (k === "straight" || k === "pair_straight") return fxStraight(p, k);
  const heavy = /^(trio|four)/.test(k), bigCard = d.cards.some((r) => r >= 15);
  FX.ring(p.x, p.y, { c: col, vr: heavy ? 1300 : 900, w: heavy ? 12 : 8, life: 0.45 });
  FX.burst(p.x, p.y, { n: heavy ? 50 : 18, colors: [col, "#ffffff"], speed: [200, heavy ? 900 : 600], g: 300, life: [0.3, 0.7] });
  FX.shake(heavy ? 0.32 : 0.15); FX.punch(heavy ? 0.022 : 0.008);
  if (k.startsWith("four")) big("四 带 二", "straight", 1300);
  if (bigCard) {
    FX.glow(p.x, p.y, { size: 260, c: "rgba(255,210,110,.9)", life: 0.35 });
    FX.ring(p.x, p.y, { c: "#ffd36b", vr: 1600, w: 14, life: 0.55 });
    FX.burst(p.x, p.y, { n: 60, colors: GOLD, speed: [300, 1100], g: 400 });
    FX.shake(0.25); sfx("big");
  } else sfx(heavy ? "heavy" : "play");
}

function fxBomb(p) {
  FX.punch(0.08); sfx("charge");
  FX.glow(p.x, p.y, { size: 180, c: "rgba(255,120,0,1)", life: 0.25 });
  later(200, () => {
    FX.flash(`radial-gradient(circle at ${(p.x / 19.2).toFixed(1)}% ${(p.y / 10.8).toFixed(1)}%, #fff, rgba(255,140,0,.65) 35%, rgba(120,0,0,.3) 70%, transparent)`, 750);
    FX.glow(p.x, p.y, { size: 800, c: "rgba(255,200,120,1)", life: 0.55 });
    [["#ffffff", 2400, 28, 0], ["#ffb020", 1700, 20, 90], ["#ff3d2d", 1200, 14, 180], ["#ff9a1f", 2800, 6, 260]]
      .forEach(([c, vr, w, dl]) => setTimeout(() => FX.ring(p.x, p.y, { c, vr, w, life: 0.75, vd: 0.94 }), dl));
    FX.burst(p.x, p.y, { n: 260, colors: FIRE, speed: [400, 1800], g: 700, len: [0.03, 0.07], w: [2, 5], life: [0.6, 1.4] });
    FX.debris(p.x, p.y, { n: 45 });
    FX.smoke(p.x, p.y, { n: 26 });
    FX.embers(p.x, p.y, { n: 90, r: 180, colors: FIRE });
    FX.shake(1.15); FX.punch(-0.06); FX.rgb(650); FX.bgHit("hit-red", 1100);
    big("炸 弹", "bomb", 1900); sfx("bomb");
  });
  later(700, () => { FX.embers(p.x, p.y, { n: 50, r: 260, colors: FIRE }); FX.shake(0.3); });
}

function fxRocket(p) {
  sfx("launch"); FX.speed(1700, "rgba(255,255,255,.7)"); FX.punch(0.05);
  FX.shell(p.x, p.y, 740, 260, 0.5, RAINBOW, (x, y) => {
    if (!G.live) return;
    FX.flash("radial-gradient(circle at 38% 24%, #fff, rgba(255,120,220,.65) 35%, rgba(60,0,120,.35) 70%, transparent)", 950);
    FX.glow(x, y, { size: 1000, c: "rgba(255,255,255,1)", life: 0.65 });
    FX.firework(x, y, RAINBOW);
    FX.burst(x, y, { n: 300, colors: RAINBOW, speed: [500, 2100], g: 500, len: [0.03, 0.08], w: [2, 5], life: [0.8, 1.7] });
    [0, 90, 180, 270, 360].forEach((dl, i) => setTimeout(() => FX.ring(x, y, { c: RAINBOW[i], vr: 2600 - i * 300, w: 26 - i * 4, life: 0.85, vd: 0.95 }), dl));
    FX.shake(1.5); FX.punch(-0.09); FX.rgb(1000); FX.bgHit("hit-rainbow", 1700);
    big("王 炸", "rocket", 2300); sfx("rocket");
    for (let k = 0; k < 7; k++) {
      later(280 + k * 200, () => {
        const tx = FX.rnd(160, 1360), ty = FX.rnd(170, 620);
        FX.shell(FX.rnd(250, 1250), 1080, tx, ty, FX.rnd(0.35, 0.55), RAINBOW, (a, b) => {
          if (!G.live) return;
          FX.firework(a, b, [FX.pick(RAINBOW), FX.pick(RAINBOW), "#ffffff"]); FX.shake(0.28); sfx("pop");
        }, { thick: 1, size: 5 });
      });
    }
  }, { thick: 4, size: 10, fall: 160 });
}

function fxPlane(p) {
  FX.speed(1500, "rgba(62,231,255,.6)"); sfx("jet");
  big("飞 机", "plane", 1600);
  FX.ring(p.x, p.y, { c: "#3ee7ff", vr: 1400, w: 12 });
  FX.burst(p.x, p.y, { n: 60, colors: CYAN, speed: [300, 1000], g: 200 });
  FX.plane(1500, (x, y) => {
    if (!G.live || x == null) return;
    FX.ring(x, y, { c: "#ffffff", vr: 2200, w: 10, life: 0.6 });
    FX.ring(x, y, { c: "#3ee7ff", vr: 1500, w: 18, life: 0.7 });
    FX.shake(0.6); FX.punch(0.03); FX.rgb(400); sfx("boom");
  });
}

function fxStraight(p, k) {
  const cols = k === "straight" ? CYAN : ["#f3e8ff", "#b98bff", "#ff6fb5", "#ffffff"];
  FX.speed(1300, k === "straight" ? "rgba(62,231,255,.5)" : "rgba(185,139,255,.5)");
  big(COMBO_TEXT[k].split("").join(" "), k, 1500); sfx("swoosh");
  FX.shell(60, p.y, 1420, p.y, 0.45, cols, (x, y) => { if (G.live) { FX.burst(x, y, { n: 60, colors: cols, dir: 0, spread: 1.4, speed: [300, 900] }); } }, { thick: 4, size: 9, fall: 220 });
  later(250, () => { FX.ring(p.x, p.y, { c: cols[1], vr: 1500, w: 14 }); FX.burst(p.x, p.y, { n: 70, colors: cols, speed: [300, 1100], g: 350 }); FX.shake(0.45); sfx("combo"); });
}

function fxBid(d) {
  if (!G.live || !d.bid) return;
  const p = seatPos(d.seat);
  FX.ring(p.x, p.y, { c: "#ffd36b", vr: 600 + d.bid * 300, w: 6 + d.bid * 3, life: 0.5 });
  if (d.bid === 3) {
    FX.burst(p.x, p.y, { n: 100, colors: FIRE, speed: [300, 1100], g: 300 });
    FX.embers(p.x, p.y, { n: 40, r: 60, colors: FIRE });
    FX.shake(0.5); FX.punch(0.02);
    big(`${G.seats[d.seat].name} 叫 3 分`, "lord", 1400); sfx("heavy");
  }
}

function fxLandlord(seat, name) {
  if (!G.live) { return; }
  const p = seatPos(seat);
  sfx("thunder");
  FX.bolt(p.x, p.y, "#ffe08a");
  later(80, () => FX.bolt(p.x, p.y, "#bfe8ff"));
  FX.flash("rgba(255,250,220,.55)", 350);
  FX.glow(p.x, p.y, { size: 420, c: "rgba(255,220,120,1)", life: 0.6 });
  FX.ring(p.x, p.y, { c: "#ffd36b", vr: 1800, w: 18, life: 0.7 });
  FX.burst(p.x, p.y, { n: 140, colors: GOLD, speed: [300, 1300], g: 500 });
  FX.glitter(p.x, p.y, { n: 60, colors: GOLD });
  FX.rays(p.x, p.y, "rgba(255,211,107,.55)", 2600);
  FX.shake(0.8); FX.punch(0.03);
  big(`${name} 成为地主`, "lord", 1800);
  later(300, () => sfx("lord"));
}

function fxAlarm(seat, left) {
  if (!G.live) return;
  const p = seatPos(seat), name = G.seats[seat].name;
  toast(`${name} 报警！只剩 ${left} 张`);
  FX.danger(true);
  FX.ring(p.x, p.y, { c: "#ff2d4a", vr: 900, w: 12, life: 0.7 });
  later(250, () => FX.ring(p.x, p.y, { c: "#ff2d4a", vr: 900, w: 12, life: 0.7 }));
  FX.burst(p.x, p.y, { n: 60, colors: ["#ff2d4a", "#ff8095", "#ffffff"], speed: [200, 800], g: 200 });
  FX.flash("radial-gradient(ellipse, transparent 40%, rgba(255,0,40,.55))", 700);
  FX.shake(0.45);
  later(200, () => sfx("siren"));
}

function fxStart(no) {
  if (!G.live) return;
  FX.speed(1400, "rgba(255,211,107,.55)");
  big(`第 ${no} 局`, "start", 1300); sfx("start");
  later(1050, () => {
    big("开 战", "fight", 1200);
    FX.flash("rgba(255,255,255,.35)", 300);
    FX.ring(CENTER.x, CENTER.y, { c: "#ffd36b", vr: 2200, w: 22 });
    FX.ring(CENTER.x, CENTER.y, { c: "#ff4d6d", vr: 1500, w: 12 });
    FX.burst(CENTER.x, CENTER.y, { n: 140, colors: GOLD.concat("#ff4d6d"), speed: [400, 1500], g: 300 });
    FX.shake(0.7); FX.punch(0.04); FX.rgb(350); sfx("fight");
  });
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
  for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = type; f.frequency.setValueAtTime(lp, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  g.gain.value = vol;
  s.connect(f).connect(g).connect(FX.sfxOut()); s.start(t);
}
const arp = (fs, step, dur, type = "triangle", vol = 0.1, at = 0) => fs.forEach((f, i) => tone(f, dur, type, vol, at + i * step));
const SOUNDS = {
  play: () => { tone(900, 0.05, "triangle", 0.12); noise(0.05, 0.25, 0, 3500); },
  heavy: () => { tone(220, 0.16, "square", 0.1, 0, 110); noise(0.14, 0.4, 0, 1600); },
  big: () => { arp([880, 1320, 1760], 0.04, 0.12, "square", 0.06); noise(0.15, 0.3, 0, 2500); },
  pass: () => tone(240, 0.09, "sine", 0.08),
  bid: () => tone(560, 0.12, "triangle", 0.12),
  combo: () => arp([523, 659, 784, 1047, 1319], 0.05, 0.14, "square", 0.06),
  swoosh: () => noise(0.45, 0.45, 0, 400, 6000, "bandpass"),
  charge: () => tone(180, 0.2, "sawtooth", 0.14, 0, 1100),
  boom: () => { noise(0.5, 0.6, 0, 900); tone(90, 0.4, "sine", 0.4, 0, 35); },
  bomb: () => { noise(1.1, 1, 0, 1200, 120); tone(110, 0.8, "sawtooth", 0.35, 0, 28); tone(55, 1.1, "sine", 0.6, 0, 22); noise(0.6, 0.4, 0.15, 500); },
  launch: () => { noise(0.5, 0.5, 0, 500, 7000, "bandpass"); tone(300, 0.5, "sawtooth", 0.1, 0, 2200); },
  rocket: () => { noise(1.5, 1, 0, 2000, 100); tone(80, 1.2, "sawtooth", 0.4, 0, 25); tone(45, 1.5, "sine", 0.7, 0, 20); arp([784, 988, 1175, 1568, 1976], 0.07, 0.2, "square", 0.06, 0.15); },
  pop: () => { noise(0.3, 0.6, 0, 2600); for (let k = 0; k < 6; k++) noise(0.03, 0.2, 0.1 + k * 0.045, 7000, 0, "highpass"); },
  jet: () => { noise(1.3, 0.45, 0, 300, 4000, "bandpass"); tone(140, 1.3, "sawtooth", 0.07, 0, 700); },
  thunder: () => { noise(1, 0.9, 0, 3000, 150); tone(70, 0.8, "sawtooth", 0.3, 0, 28); },
  fight: () => { arp([392, 523, 659, 1047], 0.05, 0.3, "square", 0.08); noise(0.4, 0.5, 0, 1500); tone(60, 0.5, "sine", 0.5, 0, 30); },
  siren: () => { for (let k = 0; k < 3; k++) { tone(880, 0.18, "square", 0.07, k * 0.36, 1320); tone(1320, 0.18, "square", 0.07, k * 0.36 + 0.18, 880); } },
  lord: () => arp([392, 523, 659, 784, 1047], 0.08, 0.22, "triangle", 0.12),
  win: () => arp([523, 659, 784, 1047, 1319, 1568], 0.1, 0.3, "triangle", 0.12),
  out: () => { tone(420, 0.6, "sawtooth", 0.14, 0, 70); noise(0.5, 0.6, 0, 900, 100); tone(50, 0.6, "sine", 0.5, 0, 25); },
  next: () => { arp([440, 554, 659, 880, 1109], 0.06, 0.16, "square", 0.06); noise(0.5, 0.3, 0, 500, 6000, "bandpass"); },
  start: () => { arp([330, 440, 554], 0.1, 0.18, "triangle", 0.1); noise(0.8, 0.3, 0, 300, 5000, "bandpass"); },
};
function sfx(name) { if (G.live && SFX.on && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) { /* 忽略 */ } } }
function initSoundBtn() {
  const b = $("sound"), m = $("bgm");
  const paint = () => {
    b.textContent = SFX.on ? "音效 开" : "音效 关"; b.classList.toggle("off", !SFX.on);
    m.textContent = FX.BGM.on ? "音乐 开" : "音乐 关"; m.classList.toggle("off", !FX.BGM.on);
  };
  b.onclick = () => { SFX.on = !SFX.on; localStorage.setItem("dd_sound", SFX.on ? "on" : "off"); if (SFX.on) actx(); paint(); };
  m.onclick = () => { FX.bgmToggle(); paint(); };
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
    const pts = d.multiplier * (role === "地主" ? 2 : 1);
    return `<div class="rc${win ? " win" : ""}${i === loserIdx ? " loser" : ""}" style="--i:${i};${pcVars(n)}">
      ${avatarHtml(n)}
      <div class="nm">${esc(n)}</div>
      <div class="rl"><span class="tag ${role === "地主" ? "dz" : "nm"}">${role}</span></div>
      <div class="delta ${win ? "pos" : "neg"}">${win ? "+" : "-"}${pts}</div>
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
  ov.querySelectorAll(".rc").forEach((el, i) => { if (d.roles[i] === "地主") el.classList.add("landlord"); });
  ov.classList.add("show");

  const stampLoser = () => {
    const rc = ov.querySelectorAll(".rc")[loserIdx];
    if (rc) { rc.classList.add("stamped"); rc.insertAdjacentHTML("beforeend", `<div class="stamp">淘汰</div>`); }
    ov.querySelector(".res-reason").textContent = `${d.loser} 下场 · ${d.reason}`;
    return rc;
  };
  const showNext = () => {
    if (!d.newcomer) return null;
    $("resNext").innerHTML = `<div class="res-next" style="${pcVars(d.newcomer)}">${avatarHtml(d.newcomer)}<div><small>挑战者登场</small>${esc(d.newcomer)}</div></div>`;
    return $("resNext").firstElementChild;
  };
  if (!G.live) { stampLoser(); showNext(); return; }

  const winCols = lordWin ? GOLD : ["#8ff5c0", "#2fcf86", "#ffffff", "#ffd36b"];
  sfx("win");
  FX.flash("rgba(255,255,255,.4)", 400);
  FX.confetti(0, 1080, { dir: -1.0, spread: 0.7, n: 180 });
  FX.confetti(1920, 1080, { dir: -2.14, spread: 0.7, n: 180 });
  for (let k = 0; k < 6; k++) later(150 + k * 260, () => { FX.firework(FX.rnd(300, 1620), FX.rnd(130, 380), winCols); sfx("pop"); });
  later(500, () => FX.rain({ n: 120 }));
  if (d.spring) later(300, () => { big(lordWin ? "春 天" : "反 春", "spring", 2200); petals(90); FX.shake(0.6); });

  await wait(1700); if (seq !== G.endSeq) return;
  const rc = stampLoser(); sfx("out");
  if (rc) {
    const p = FX.at(rc);
    FX.flash("radial-gradient(circle, rgba(255,30,60,.55), transparent 70%)", 600);
    FX.ring(p.x, p.y, { c: "#ff2d4a", vr: 1800, w: 20, life: 0.7 });
    FX.debris(p.x, p.y, { n: 40, colors: ["#555a70", "#2b2f44", "#ff2d4a", "#8a8fa8"] });
    FX.shake(1.0); FX.punch(0.05); FX.rgb(500);
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
    FX.shake(0.5);
  }
}
function showChampion(d) {
  const ov = $("overlay");
  ov.innerHTML = `<div class="res-title">最终赢家</div><div class="res-sub">擂台赛结束</div>
    <div class="res-cards">${d.names.map((n, i) => `<div class="rc win" style="--i:${i};${pcVars(n)}">${avatarHtml(n)}<div class="nm">${esc(n)}</div></div>`).join("")}</div>`;
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

const H = {
  synced() { G.live = true; FX.bgmStart(); },

  game_start(d) {
    G.endSeq++; $("overlay").classList.remove("show");
    G.snap = d; G.profiles = d.profiles || G.profiles; G.gameNo = d.game_no;
    G.bid = 0; G.mult = 1; G.landlord = -1; G.turn = -1; G.roles = [null, null, null];
    d.table.forEach((n, i) => Object.assign(G.seats[i], { name: n, hand: [], played: null, thinking: false, alarmed: false }));
    for (let i = 0; i < 3; i++) { buildSeat(i); renderPlayed(i); }
    hideBubbles(); setTop(); setPhase("叫地主"); setHint("");
    $("bottom").innerHTML = cardsHtml([{ back: 1 }, { back: 1 }, { back: 1 }], 3);
    renderBoard(d); renderAllSeats();
    feed(null, `第 ${d.game_no} 局开始：${d.table.join(" / ")}`);
    FX.danger(false); fxStart(d.game_no);
  },

  deal(d) {
    G.used = {};
    d.hands.forEach((h, i) => { G.seats[i].hand = toCards(h); renderHand(i, true); });
    renderAllSeats();
  },

  redeal(d) { toast(d.reason, "blue"); feed(null, d.reason); },

  turn(d) {
    const s = G.seats[d.seat];
    G.turn = d.seat; s.thinking = true; s.t0 = performance.now();
    if (d.phase === "play") { s.played = null; renderPlayed(d.seat); }
    bubble(d.seat, "", "");
    setHint(d.phase === "bid" ? `${s.name} 正在考虑叫分…` : d.lead ? `${s.name} 首家出牌` : `轮到 ${s.name}`);
    renderAllSeats();
  },

  bid(d) {
    const s = G.seats[d.seat]; s.thinking = false;
    const { warn, text } = splitSay(d.say);
    bubble(d.seat, `<b class="bid">${d.bid ? `叫 ${d.bid} 分` : "不叫"}</b>`, text, warn);
    feed(s.name, d.bid ? `叫 ${d.bid} 分` : "不叫", { say: text, pass: !d.bid });
    if (d.bid) { G.bid = d.bid; setTop(); }
    sfx(d.bid ? "bid" : "pass"); renderAllSeats(); fxBid(d);
  },

  landlord(d) {
    G.landlord = d.seat; G.roles = d.roles; G.bid = d.bid; G.mult = d.bid; setTop();
    G.bottom = toCards(d.bottom);
    $("bottom").innerHTML = cardsHtml(G.bottom, 3, "").replace(/class="card/g, `class="${G.live ? "flip " : ""}card`);
    const s = G.seats[d.seat];
    s.hand = s.hand.concat(G.bottom.map((c) => ({ ...c })));
    for (let i = 0; i < 3; i++) { resyncHand(i, d.hands[i]); renderHand(i, false); }
    hideBubbles(); setPhase("出牌中"); setHint("");
    renderAllSeats();
    feed(null, `${s.name} 成为地主，底牌 ${fmtRanks(d.bottom)}`);
    fxLandlord(d.seat, s.name);
  },

  play(d) {
    const s = G.seats[d.seat]; s.thinking = false;
    if (d.cards.length) {
      const out = [];
      for (const r of d.cards) { const k = s.hand.findIndex((c) => c.r === r); out.push(k >= 0 ? s.hand.splice(k, 1)[0] : { r, s: Math.max(0, takeSuit(r)) }); }
      s.played = out; s.label = d.type; s.hot = d.kind === "bomb" || d.kind === "rocket";
    } else s.played = "pass";
    resyncHand(d.seat, d.hands[d.seat]);
    renderHand(d.seat, false); renderPlayed(d.seat, true);

    const { warn, text } = splitSay(d.say);
    if (text) bubble(d.seat, "", text, warn);
    if (d.cards.length) {
      feed(s.name, d.type, { cards: fmtRanks(d.cards), say: text, hot: s.hot });
      fxPlay(d);
    } else { feed(s.name, "不要", { say: text, pass: true }); sfx("pass"); }

    if (d.multiplier) setMult(d.multiplier);
    const left = s.hand.length;
    if (left > 0 && left <= 2 && !s.alarmed) { s.alarmed = true; fxAlarm(d.seat, left); if (!G.live) FX.danger(true); }
    G.turn = -1; setHint("");
    renderAllSeats();
  },

  new_round() {
    for (let i = 0; i < 3; i++) { G.seats[i].played = null; renderPlayed(i); }
  },

  game_end(d) {
    G.seats.forEach((s) => (s.thinking = false)); G.turn = -1; FX.danger(false);
    d.hands_left.forEach((h, i) => { resyncHand(i, h); renderHand(i, false); });
    G.snap = d; G.profiles = d.profiles || G.profiles;
    renderAllSeats(); renderBoard(d); setPhase("结算"); setHint("");
    feed(null, `${d.winner_side}胜利 · ${d.loser} 下场${d.newcomer ? ` · ${d.newcomer} 上场` : ""}`);
    showResult(d);
  },

  champion(d) { showChampion(d); },
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
    const el = $("seat" + i).querySelector(".think span");
    if (el) el.textContent = `思考中 ${((performance.now() - s.t0) / 1000).toFixed(1)}s`;
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

FX.init();
for (let i = 0; i < 3; i++) buildSeat(i);
fit(); initSoundBtn(); connect();
window.DD = { handle, G };
})();
