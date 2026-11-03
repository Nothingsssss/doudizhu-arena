/* Live2D 调试页：和正式直播页面完全分开，只依赖 live2d/live2d.js 暴露的 window.Live2D */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const L = window.Live2D;
  const stage = $("stage");
  const cells = []; // { id, name, el, ctrl, state }
  let cur = null;
  let chars = [];

  function logLine(level, msg) {
    const d = document.createElement("div");
    d.className = level;
    d.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    $("log").prepend(d);
    while ($("log").childNodes.length > 200) $("log").lastChild.remove();
  }
  if (!L) {
    document.body.innerHTML = '<p style="padding:20px;color:#ff5b5b">live2d/live2d.js 没有加载成功，请先运行 node live2d/build.mjs</p>';
    return;
  }
  L.onLog((lv, m) => logLine(lv, m));
  window.addEventListener("error", (e) => logLine("error", e.message));
  window.addEventListener("unhandledrejection", (e) => logLine("error", String(e.reason && e.reason.message || e.reason)));

  const pill = (id, text, ok) => { const p = $(id); p.textContent = text; p.className = "pill " + (ok === true ? "ok" : ok === false ? "bad" : ""); };
  const gl = L.webglSupport();
  pill("sWebgl", gl.webgl2 ? "WebGL 2" : gl.webgl ? "WebGL 1" : "不支持 WebGL", gl.webgl);
  pill("sFw", L.framework, true);
  const coreReady = L.loadCore();
  coreReady.then(
    (info) => { pill("sCore", `Cubism Core ${info.version}（moc3 ≤ v${info.latestMocVersion}）`, true); L.assets.onError((e) => logLine("error", `资源 ${e.url}：${e.message}`)); },
    (e) => { pill("sCore", "Cubism Core 未安装", false); logLine("error", e.message); }
  );
  const unlock = () => L.unlockAudio().then((ok) => pill("sAudio", ok ? "音频 已解锁" : "音频 未解锁", ok || undefined));
  document.addEventListener("pointerdown", unlock);

  /* ---------- 模型列表 ---------- */
  fetch("live2d/characters.json").then((r) => r.json()).then((j) => {
    chars = (j.characters || []).filter((c) => c && c.id && c.model);
    $("mSel").innerHTML = chars.map((c, i) => `<option value="${i}">${c.name || c.id}</option>`).join("") + '<option value="">（自定义路径）</option>';
  }).catch((e) => logLine("error", "读取 live2d/characters.json 失败：" + e.message));

  function pickedConfig() {
    const url = $("mUrl").value.trim();
    if (url) return { id: url.split("/").pop().replace(/\.model3\.json.*/, ""), name: url.split("/").pop(), model: url };
    const c = chars[+$("mSel").value];
    return c ? { ...c } : null;
  }

  function layout() {
    const n = Math.max(1, cells.length);
    const cols = Math.ceil(Math.sqrt(n));
    stage.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    stage.style.gridTemplateRows = `repeat(${Math.ceil(n / cols)}, 1fr)`;
    $("empty").style.display = cells.length ? "none" : "flex";
  }

  function select(c) {
    cur = c;
    cells.forEach((x) => x.el.classList.toggle("cur", x === c));
    refreshPanel();
  }

  async function loadInto(cell, cfg) {
    const st = cell.el.querySelector(".state");
    st.className = "state"; st.textContent = "加载中…";
    cell.el.querySelector(".tag").textContent = cfg.name || cfg.id;
    $("mRes").className = "res"; $("mRes").textContent = "";
    const t0 = performance.now();
    try {
      await L.loadCore();
      if (!cell.ctrl) cell.ctrl = new L.Live2DController(cell.el);
      await cell.ctrl.loadModel(cfg.model, cfg);
      st.textContent = "";
      cell.cfg = cfg;
      $("mRes").textContent = `${cfg.name || cfg.id} 加载完成，用时 ${Math.round(performance.now() - t0)} ms`;
    } catch (e) {
      st.className = "state err"; st.textContent = e.message;
      $("mRes").className = "res bad"; $("mRes").textContent = e.message;
      logLine("error", e.message);
    }
    if (cur === cell) refreshPanel();
  }

  function addCell(cfg) {
    const el = document.createElement("div");
    el.className = "cell";
    el.innerHTML = '<span class="tag"></span><div class="state"></div>';
    stage.appendChild(el);
    const cell = { el, ctrl: null, cfg: null };
    cells.push(cell);
    el.addEventListener("pointerdown", () => select(cell));
    layout();
    select(cell);
    return loadInto(cell, cfg);
  }

  $("bLoad").onclick = () => { const c = pickedConfig(); if (c) addCell(c); };
  $("bReplace").onclick = () => { const c = pickedConfig(); if (!c) return; if (cur) loadInto(cur, c); else addCell(c); };
  $("bUnload").onclick = () => {
    if (!cur) return;
    cur.ctrl && cur.ctrl.destroy();
    cur.el.remove();
    cells.splice(cells.indexOf(cur), 1);
    cur = null;
    layout();
    if (cells.length) select(cells[cells.length - 1]); else refreshPanel();
  };
  $("bHide").onclick = () => {
    const c = ctl(); if (!c) return;
    const hidden = $("bHide").classList.toggle("on");
    hidden ? c.hide() : c.show();
    $("bHide").textContent = hidden ? "显示" : "隐藏";
  };

  const ctl = () => (cur && cur.ctrl && cur.ctrl.ready ? cur.ctrl : null);
  const show = (id, r) => {
    const el = $(id);
    if (!r) { el.textContent = ""; return; }
    el.className = "res" + (r.ok === false ? " bad" : "");
    el.textContent = r.ok === false ? r.reason : `完成（${r.via || ""}${r.reason ? "，" + r.reason : ""}${r.result ? "，" + r.result : ""}）`;
  };
  const guard = (id, fn) => async (...a) => {
    const c = ctl(); if (!c) { show(id, { ok: false, reason: "先加载模型" }); return; }
    try { show(id, await fn(c, ...a)); } catch (e) { show(id, { ok: false, reason: e.message }); }
  };

  /* ---------- 位置缩放 ---------- */
  for (const [id, key] of [["tx", "x"], ["ty", "y"], ["ts", "scale"]]) {
    const inp = $(id);
    inp.oninput = () => { inp.nextElementSibling.textContent = (+inp.value).toFixed(2); const c = ctl(); if (c) c.setTransform({ [key]: +inp.value }); };
    inp.nextElementSibling.textContent = (+inp.value).toFixed(2);
  }

  /* ---------- 头部拖动 ---------- */
  const pad = $("pad"), dot = pad.querySelector("i");
  let dragging = false;
  const padSet = (e) => {
    const r = pad.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
    dot.style.left = `${(nx + 1) * 50}%`; dot.style.top = `${(1 - ny) * 50}%`;
    const c = ctl(); if (c) show("aRes", c.setHeadAngle(nx * 30, ny * 30, +$("hz").value));
  };
  pad.addEventListener("pointerdown", (e) => { dragging = true; pad.setPointerCapture(e.pointerId); padSet(e); });
  pad.addEventListener("pointermove", (e) => dragging && padSet(e));
  const padEnd = () => { if (!dragging) return; dragging = false; dot.style.left = dot.style.top = "50%"; const c = ctl(); if (c && +$("hz").value === 0) c.clearHeadAngle(); };
  pad.addEventListener("pointerup", padEnd);
  pad.addEventListener("pointercancel", padEnd);
  $("hz").oninput = () => {
    $("hz").nextElementSibling.textContent = $("hz").value;
    const c = ctl(); if (!c) return;
    if (+$("hz").value === 0) c.clearHeadAngle(); else c.setHeadAngle(0, 0, +$("hz").value);
  };
  $("hz").nextElementSibling.textContent = "0";
  stage.addEventListener("pointermove", (e) => {
    if (!$("follow").checked) return;
    for (const cell of cells) if (cell.ctrl && cell.ctrl.ready) { const p = cell.ctrl.canvas.toLook(e.clientX, e.clientY); cell.ctrl.setLookTarget(p.x, p.y); }
  });
  $("follow").onchange = () => { if (!$("follow").checked) for (const cell of cells) if (cell.ctrl && cell.ctrl.ready) cell.ctrl.setLookTarget(0, 0); };

  /* ---------- 眼睛嘴巴 ---------- */
  const syncEye = () => { const c = ctl(); $("eye").disabled = $("eyeAuto").checked; if (c) show("aRes", c.setEyeOpen($("eyeAuto").checked ? null : +$("eye").value)); $("eye").nextElementSibling.textContent = (+$("eye").value).toFixed(2); };
  $("eyeAuto").onchange = syncEye; $("eye").oninput = syncEye;
  const syncMouth = () => { const c = ctl(); $("mouth").disabled = $("mouthAuto").checked; if (c) show("sRes", c.setMouthOpen($("mouthAuto").checked ? null : +$("mouth").value)); $("mouth").nextElementSibling.textContent = (+$("mouth").value).toFixed(2); };
  $("mouthAuto").onchange = syncMouth; $("mouth").oninput = syncMouth;

  /* ---------- 情绪 / 动作按钮 ---------- */
  const ZH = { neutral: "正常", happy: "开心", angry: "生气", sad: "难过", surprised: "惊讶", thinking: "思考", shy: "害羞", confident: "自信",
    nod: "点头", shake: "摇头", lowerHead: "低头", tilt: "身体倾斜", wave: "挥手" };
  $("emos").innerHTML = L.EMOTIONS.map((e) => `<button data-e="${e}">${ZH[e]}</button>`).join("");
  $("emos").onclick = (ev) => { const b = ev.target.closest("button"); if (b) guard("eRes", (c) => c.setEmotion(b.dataset.e))(); };
  $("acts").innerHTML = L.INTERACTIONS.map((a) => `<button data-a="${a}">${ZH[a]}</button>`).join("");
  $("acts").onclick = (ev) => { const b = ev.target.closest("button"); if (b) guard("aRes", (c) => c.interact(b.dataset.a))(); };
  $("exps").onclick = (ev) => { const b = ev.target.closest("button"); if (b) guard("eRes", (c) => c.setExpression(b.dataset.x))(); };
  $("mots").onclick = (ev) => { const b = ev.target.closest("button"); if (b) guard("aRes", (c) => c.playMotion(b.dataset.m, L.Priority.Force))(); };
  $("idle").onchange = () => { const c = ctl(); if (c) $("idle").checked ? c.startIdle() : c.stopIdle(); };
  $("phys").onchange = guard("aRes", (c) => c.setPhysics($("phys").checked));

  /* ---------- 音频 ---------- */
  // 内置测试音：合成一段 3 秒、有音节起伏的"人声"，用 blob 地址播放（同源，可以做真实音频分析）
  function makeTestWav() {
    const sr = 22050, dur = 3.2, n = Math.floor(sr * dur);
    const data = new Int16Array(n);
    const syll = [0.0, 0.22, 0.42, 0.66, 0.84, 1.3, 1.5, 1.72, 1.95, 2.4, 2.58, 2.8];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = 0;
      for (const s of syll) { const x = (t - s) / 0.17; if (x > 0 && x < 1) env = Math.max(env, Math.sin(Math.PI * x) * (0.6 + 0.4 * Math.sin(s * 7))); }
      const f0 = 170 + 30 * Math.sin(t * 2.1);
      let v = 0;
      for (let h = 1; h <= 12; h++) { const f = f0 * h; const formant = Math.exp(-((f - 700) ** 2) / 90000) + 0.6 * Math.exp(-((f - 1200) ** 2) / 160000) + 0.15; v += Math.sin(2 * Math.PI * f * t) * formant / h; }
      data[i] = Math.max(-1, Math.min(1, v * env * 0.5)) * 32767;
    }
    const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const w = (o, s) => [...s].forEach((ch, k) => dv.setUint8(o + k, ch.charCodeAt(0)));
    w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * 2, true);
    new Int16Array(buf, 44).set(data);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  let toneUrl = null, playing = null;
  async function playUrl(url) {
    const c = ctl(); if (!c) return show("sRes", { ok: false, reason: "先加载模型" });
    stopAudio();
    await unlock();
    const a = new Audio(url);
    playing = a;
    const r = c.startSpeaking({ audio: a, text: "测试音频播放中", duration: 3 });
    a.onended = () => { c.stopSpeaking(); show("sRes", { ok: true, via: "audio", reason: "播放结束，嘴巴已闭合" }); };
    try { await a.play(); show("sRes", r); } catch (e) { c.stopSpeaking(); show("sRes", { ok: false, reason: "浏览器阻止了自动播放，请再点一次：" + e.message }); }
  }
  function stopAudio() { if (playing) { playing.pause(); playing = null; } const c = ctl(); if (c) c.stopSpeaking(); }
  $("bTone").onclick = () => { toneUrl = toneUrl || makeTestWav(); playUrl(toneUrl); };
  $("bStop").onclick = () => { stopAudio(); show("sRes", { ok: true, reason: "已停止" }); };
  $("bEst").onclick = guard("sRes", (c) => c.startSpeaking({ text: "大家好，我是今天的选手，请多指教！", duration: 3.2 }));
  $("aFile").onchange = () => { const f = $("aFile").files[0]; if (f) playUrl(URL.createObjectURL(f)); };
  $("bUrl").onclick = () => { const u = $("aUrl").value.trim(); if (u) playUrl(u); };

  /* ---------- 面板刷新 ---------- */
  function refreshPanel() {
    const c = ctl();
    $("exps").innerHTML = c ? c.model.expressionNames().map((x) => `<button data-x="${x}">${x}</button>`).join("") : "";
    const caps = c ? c.capabilities() : {};
    const groups = caps.motionGroups || {};
    $("mots").innerHTML = Object.entries(groups).map(([g, n]) => `<button data-m="${g}">${g}×${n}</button>`).join("");
    $("caps").textContent = c ? JSON.stringify(caps, null, 1) : "";
    if (c && c.slot) {
      const t = c.slot.transform;
      $("tx").value = t.x; $("ty").value = t.y; $("ts").value = t.scale;
      for (const id of ["tx", "ty", "ts"]) $(id).nextElementSibling.textContent = (+$(id).value).toFixed(2);
      $("phys").checked = c.model.isPhysicsEnabled(); $("phys").disabled = !caps.physics;
      for (const b of $("acts").querySelectorAll("button")) b.disabled = !caps[b.dataset.a];
    }
  }

  setInterval(() => {
    const c = ctl();
    if (c) {
      const ps = c.getParameters();
      $("pCount").textContent = `${ps.length} 个`;
      $("params").innerHTML = ps.map((p) => {
        const k = p.max > p.min ? (p.value - p.min) / (p.max - p.min) : 0;
        const z = p.max > p.min ? (0 - p.min) / (p.max - p.min) : 0;
        const l = Math.min(k, z) * 100, w = Math.abs(k - z) * 100;
        return `<div><span title="${p.id}">${p.id}</span><s><b style="left:${l}%;width:${Math.max(1, w)}%"></b></s><output>${p.value.toFixed(2)}</output></div>`;
      }).join("");
    } else { $("params").innerHTML = ""; $("pCount").textContent = ""; }
    const lines = cells.map((cell, i) => {
      if (!cell.ctrl) return `#${i + 1} 未加载`;
      const s = cell.ctrl.canvas.getStats();
      const a = cell.ctrl.audio;
      return `#${i + 1} ${cell.cfg ? cell.cfg.id : "…"}  ${s.fps} fps  ${s.frameMs.toFixed(2)} ms/帧  ${s.width}×${s.height}  WebGL${s.webgl}${s.paused ? "  暂停" : ""}${s.contextLost ? "  上下文丢失" : ""}\n   口型 ${a.getParameter().toFixed(2)}（${a.source}${a.source === "audio" ? " rms " + a.rms.toFixed(3) : ""}）  情绪 ${cell.ctrl.emotion}  动作 ${cell.ctrl.model ? cell.ctrl.model.currentMotion || "—" : "—"}`;
    });
    const mem = performance.memory ? `  JS 堆 ${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB` : "";
    const as = L.assets ? L.assets.stats() : { buffers: 0, images: 0, errors: 0 };
    $("perf").textContent = (lines.join("\n") || "—") + `\n缓存 ${as.buffers} 个文件 / ${as.images} 张贴图  错误 ${as.errors}${mem}`;
  }, 250);

  layout();
  window.L2DDebug = { cells, select, addCell };
})();
