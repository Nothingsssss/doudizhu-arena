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
  G.mult = m; setTop();
  const p = document.querySelector(".pill.mult");
  p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump");
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
const fxEl = () => $("fx");
function fxAdd(el, ms) { fxEl().appendChild(el); setTimeout(() => el.remove(), ms); return el; }
function big(text, cls, ms = 1900) { if (!G.live) return; const e = document.createElement("div"); e.className = "big " + cls; e.textContent = text; fxAdd(e, ms); }
function toast(text, cls = "") { if (!G.live) return; const e = document.createElement("div"); e.className = "toast " + cls; e.textContent = text; fxAdd(e, 2300); }
function shake() { if (!G.live) return; const s = $("stage"); s.classList.remove("shake"); void s.offsetWidth; s.classList.add("shake"); }
function flash(color) { if (!G.live) return; const e = document.createElement("div"); e.className = "flash"; e.style.background = color; fxAdd(e, 800); }
function sparks(n, x, y, colors, spread = 520) {
  if (!G.live) return;
  for (let k = 0; k < n; k++) {
    const e = document.createElement("div"); e.className = "spark";
    const a = Math.random() * Math.PI * 2, r = spread * (0.35 + Math.random() * 0.65);
    e.style.cssText = `left:${x}px;top:${y}px;--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;--s:${4 + Math.random() * 10}px;--c:${colors[k % colors.length]};--d:${0.7 + Math.random() * 0.8}s`;
    fxAdd(e, 1700);
  }
}
function petals(n) {
  if (!G.live) return;
  for (let k = 0; k < n; k++) {
    const e = document.createElement("div"); e.className = "petal";
    e.style.cssText = `left:${Math.random() * 1920}px;--x:${(Math.random() - 0.5) * 400}px;--d:${2.5 + Math.random() * 2.5}s;animation-delay:${Math.random() * 1.2}s;background:${["#ff9ac8", "#ffc4de", "#ff6fae"][k % 3]}`;
    fxAdd(e, 6000);
  }
}
const CENTER = [740, 470];
function comboFx(kind) {
  if (kind === "rocket") {
    big("王 炸", "rocket", 2000); shake(); flash("radial-gradient(circle, rgba(255,255,255,.9), rgba(255,80,160,.4) 60%, transparent)");
    sparks(90, ...CENTER, ["#ff3d6e", "#ffcf3d", "#3dffb4", "#3dc8ff", "#b93dff", "#fff"], 800); sfx("rocket");
  } else if (kind === "bomb") {
    big("炸 弹", "bomb"); shake(); flash("radial-gradient(circle, rgba(255,240,180,.9), rgba(255,90,0,.45) 60%, transparent)");
    sparks(60, ...CENTER, ["#fff3b0", "#ffb020", "#ff5a1f", "#ff2d2d"], 620); sfx("bomb");
  } else if (COMBO_TEXT[kind]) {
    big(COMBO_TEXT[kind].split("").join(" "), kind.startsWith("plane") ? "plane" : kind, 1600);
    sparks(24, ...CENTER, ["#3ee7ff", "#8b5cff", "#fff"], 380); sfx("combo");
  } else sfx("play");
}

/* ================= 音效（WebAudio 合成，无需素材） ================= */
const SFX = { on: localStorage.getItem("dd_sound") !== "off", ctx: null };
function actx() {
  if (!SFX.ctx) { try { SFX.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (SFX.ctx.state === "suspended") SFX.ctx.resume();
  return SFX.ctx;
}
function tone(f, dur, type = "sine", vol = 0.12, when = 0, to) {
  const c = actx(); if (!c) return;
  const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, when = 0, lp = 1000) {
  const c = actx(); if (!c) return;
  const t = c.currentTime + when, buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = "lowpass"; f.frequency.value = lp; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(t);
}
const arp = (fs, step, dur, type = "triangle", vol = 0.1) => fs.forEach((f, i) => tone(f, dur, type, vol, i * step));
const SOUNDS = {
  play: () => tone(700, 0.07, "triangle", 0.12),
  pass: () => tone(240, 0.09, "sine", 0.08),
  bid: () => tone(560, 0.12, "triangle", 0.12),
  combo: () => arp([523, 659, 784, 1047], 0.06, 0.13),
  bomb: () => { noise(0.7, 0.55, 0, 900); tone(130, 0.6, "sawtooth", 0.22, 0, 40); },
  rocket: () => { noise(1, 0.6, 0, 1600); tone(100, 0.9, "sawtooth", 0.25, 0, 30); arp([784, 988, 1175, 1568], 0.08, 0.16, "square", 0.05); },
  alarm: () => { tone(880, 0.12, "square", 0.07); tone(880, 0.12, "square", 0.07, 0.18); },
  lord: () => arp([392, 523, 659, 784], 0.09, 0.2, "triangle", 0.12),
  win: () => arp([523, 659, 784, 1047, 1319], 0.11, 0.25, "triangle", 0.12),
  out: () => { tone(420, 0.55, "sawtooth", 0.12, 0, 80); noise(0.3, 0.2, 0, 500); },
  next: () => arp([440, 554, 659, 880], 0.07, 0.15, "square", 0.05),
  start: () => arp([330, 440, 554], 0.1, 0.18, "triangle", 0.1),
};
function sfx(name) { if (G.live && SFX.on && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) { /* 忽略 */ } } }
function initSoundBtn() {
  const b = $("sound");
  const paint = () => { b.textContent = SFX.on ? "音效 开" : "音效 关"; b.classList.toggle("off", !SFX.on); };
  b.onclick = () => { SFX.on = !SFX.on; localStorage.setItem("dd_sound", SFX.on ? "on" : "off"); if (SFX.on) actx(); paint(); };
  document.addEventListener("pointerdown", () => SFX.on && actx(), { once: true });
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
  };
  const showNext = () => {
    if (!d.newcomer) return;
    $("resNext").innerHTML = `<div class="res-next" style="${pcVars(d.newcomer)}">${avatarHtml(d.newcomer)}<div><small>挑战者登场</small>${esc(d.newcomer)}</div></div>`;
  };
  if (!G.live) { stampLoser(); showNext(); return; }
  sfx("win");
  if (d.spring) { setTimeout(() => { big(lordWin ? "春 天" : "反 春", "spring", 2000); petals(80); }, 300); }
  else sparks(50, 960, 300, ["#ffd36b", "#ff9f43", "#fff"], 600);
  await wait(1700); if (seq !== G.endSeq) return;
  stampLoser(); sfx("out"); shake();
  await wait(1500); if (seq !== G.endSeq) return;
  showNext(); if (d.newcomer) sfx("next");
}
function showChampion(d) {
  const ov = $("overlay");
  ov.innerHTML = `<div class="res-title">最终赢家</div><div class="res-sub">擂台赛结束</div>
    <div class="res-cards">${d.names.map((n, i) => `<div class="rc win" style="--i:${i};${pcVars(n)}">${avatarHtml(n)}<div class="nm">${esc(n)}</div></div>`).join("")}</div>`;
  ov.classList.add("show");
  sparks(120, 960, 400, ["#ffd36b", "#ff9f43", "#fff", "#3ee7ff"], 900); sfx("win");
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
  synced() { G.live = true; },

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
    big(`第 ${d.game_no} 局`, "start", 1500); sfx("start");
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
    sfx(d.bid ? "bid" : "pass"); renderAllSeats();
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
    big(`${s.name} 成为地主`, "lord", 1700); sfx("lord");
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
      comboFx(d.kind);
    } else { feed(s.name, "不要", { say: text, pass: true }); sfx("pass"); }

    if (d.multiplier) setMult(d.multiplier);
    const left = s.hand.length;
    if (left > 0 && left <= 2 && !s.alarmed) { s.alarmed = true; toast(`${s.name} 报警！只剩 ${left} 张`); setTimeout(() => sfx("alarm"), 250); }
    G.turn = -1; setHint("");
    renderAllSeats();
  },

  new_round() {
    for (let i = 0; i < 3; i++) { G.seats[i].played = null; renderPlayed(i); }
  },

  game_end(d) {
    G.seats.forEach((s) => (s.thinking = false)); G.turn = -1;
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

for (let i = 0; i < 3; i++) buildSeat(i);
fit(); initSoundBtn(); connect();
window.DD = { handle, G };
})();
