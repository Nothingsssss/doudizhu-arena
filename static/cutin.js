/* 大招特写（类似 DNF 觉醒技能的切入画面）：
 *   闪白 → 压暗 → 斜向色带展开（带速度线）→ 人物立绘从侧面冲进来 → 上方一条眼部特写反向滑入 → 大字盖章 → 收起
 * 只用静态图片：全身立绘 + 表情图里对应场景的那一格（眼部特写），或者用户自己放的场景图。画面本身不震动。
 * 用法：CUTIN.play({ tier, side, art, artKind, eyes, color, title, sub, sfx }) → 返回特写总时长（毫秒） */
(() => {
  "use strict";
  const TIERS = {
    rocket: { dur: 1500, dim: 0.66, bandH: 440, title: 230, eyes: true, sparks: "rainbow" },
    bomb:   { dur: 1300, dim: 0.62, bandH: 420, title: 220, eyes: true, sparks: "fire" },
    alarm:  { dur: 1100, dim: 0.5,  bandH: 380, title: 190, eyes: true, sparks: "red" },
    beat:   { dur: 820,  dim: 0.28, bandH: 300, title: 160, eyes: false, sparks: "" },
  };
  const SPARKS = {
    rainbow: ["#ffffff", "#ffd36b", "#ff5a7a", "#7af0ff", "#b98bff"],
    fire: ["#ffffff", "#ffd25a", "#ff8a1f", "#ff3d2d"],
    red: ["#ffffff", "#ff8a9a", "#ff2d4a"],
  };
  let cur = null;

  /* 眼部特写：从表情图（2 行 5 列）里取第 k 格，裁出眼睛那一条。结果缓存 */
  const eyeCache = new Map();
  function eyes(sheet, k, band) {
    const key = `${sheet}|${k}|${band}`;
    if (eyeCache.has(key)) return eyeCache.get(key);
    const p = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        try {
          const cw = img.naturalWidth / 5, ch = img.naturalHeight / 2;
          const [t, b] = band || [0.3, 0.56];
          const sx = (k % 5) * cw, sy = (k < 5 ? 0 : ch) + ch * t, sh = ch * (b - t);
          const cv = document.createElement("canvas");
          cv.width = 1200; cv.height = Math.round(1200 * sh / cw);
          cv.getContext("2d").drawImage(img, sx, sy, cw, sh, 0, 0, cv.width, cv.height);
          cv.toBlob((bl) => (bl ? res(URL.createObjectURL(bl)) : rej(new Error("toBlob"))), "image/png");
        } catch (e) { rej(e); }
      };
      img.onerror = rej;
      img.src = sheet;
    });
    p.ready = null;
    p.then((u) => (p.ready = u), () => eyeCache.delete(key));
    eyeCache.set(key, p);
    return p;
  }
  /** 已经准备好的眼部特写地址（没准备好返回 ""，不等待） */
  function eyesNow(sheet, k, band) { const p = eyeCache.get(`${sheet}|${k}|${band}`); return (p && p.ready) || ""; }

  const el = (cls, parent, html) => { const e = document.createElement("div"); e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e; };
  const anim = (e, frames, opts) => e.animate(frames, Object.assign({ fill: "both" }, opts));

  function stop() {
    if (!cur) return;
    cur.root.remove();
    clearTimeout(cur.timer);
    cur = null;
  }

  function play(o) {
    const host = document.getElementById("cutin");
    if (!host || !o || !o.art) return 0;
    const T = TIERS[o.tier] || TIERS.bomb;
    const D = T.dur;
    stop();
    const right = o.side === "right";              // 人物在右边出现（右侧座位），文字在左
    const root = el("ci " + o.tier + (right ? " r" : ""), host);
    root.style.setProperty("--c", o.color || "#ff7a2a");
    root.style.setProperty("--bh", T.bandH + "px");
    const back = el("ci-back", root);
    const band = el("ci-band", root);
    el("ci-lines", band);
    el("ci-edge top", band); el("ci-edge bot", band);
    const strip = T.eyes && o.eyes ? el("ci-eyes", root, `<img src="${o.eyes}" alt="">`) : null;
    const figWrap = el("ci-fig " + (o.artKind || "full"), root, `<img src="${o.art}" alt="">`);
    const words = el("ci-words", root, `<b>${o.title}</b>${o.sub ? `<i>${o.sub}</i>` : ""}`);
    const flash = el("ci-flash", root);

    const dir = right ? 1 : -1;                    // 人物从哪边冲进来
    const out = D - 240;
    anim(flash, [{ opacity: 0.95 }, { opacity: 0 }], { duration: 200, easing: "ease-out" });
    anim(back, [{ opacity: 0 }, { opacity: T.dim, offset: 0.1 }, { opacity: T.dim, offset: 0.82 }, { opacity: 0 }], { duration: D });
    anim(band, [
      { transform: "translateY(-50%) skewY(-4deg) scaleY(0)", easing: "cubic-bezier(.2,.9,.3,1)" },
      { transform: "translateY(-50%) skewY(-4deg) scaleY(1)", offset: 150 / D },
      { transform: "translateY(-50%) skewY(-4deg) scaleY(1)", offset: out / D, easing: "ease-in" },
      { transform: "translateY(-50%) skewY(-4deg) scaleY(0)" },
    ], { duration: D });
    anim(figWrap, [
      { transform: `translateX(${dir * 900}px)`, opacity: 0, easing: "cubic-bezier(.15,.85,.25,1)" },
      { transform: "translateX(0)", opacity: 1, offset: 260 / D },
      { transform: `translateX(${-dir * 40}px)`, opacity: 1, offset: out / D, easing: "ease-in" },
      { transform: `translateX(${-dir * 220}px)`, opacity: 0 },
    ], { duration: D });
    if (strip) {
      anim(strip, [
        { transform: `translateX(${-dir * 1400}px) skewY(-4deg)`, opacity: 0, easing: "cubic-bezier(.15,.85,.25,1)" },
        { transform: "translateX(0) skewY(-4deg)", opacity: 1, offset: 240 / D },
        { transform: `translateX(${dir * 30}px) skewY(-4deg)`, opacity: 1, offset: out / D, easing: "ease-in" },
        { transform: `translateX(${dir * 900}px) skewY(-4deg)`, opacity: 0 },
      ], { duration: D });
    }
    anim(words, [
      { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0, offset: 170 / D, easing: "cubic-bezier(.3,1.5,.5,1)" },
      { transform: "translate(-50%,-50%) scale(.94)", opacity: 1, offset: 330 / D },
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 400 / D },
      { transform: "translate(-50%,-50%) scale(1.04)", opacity: 1, offset: out / D },
      { transform: "translate(-50%,-50%) scale(1.3)", opacity: 0 },
    ], { duration: D });

    const sfx = o.sfx || (() => {});
    sfx("swoosh");
    setTimeout(() => { if (cur && cur.root === root) sfx(o.tier === "beat" ? "heavy" : "stamp"); }, 300);
    // 色带两边甩出的火星
    const FX = window.FX;
    if (FX && T.sparks && FX.LV) {
      const cols = SPARKS[T.sparks];
      const y = 540;
      setTimeout(() => {
        if (!cur || cur.root !== root) return;
        for (let k = 0; k < 5; k++) {
          const x = right ? 1920 - k * 260 : k * 260;
          FX.glitter(x, y - T.bandH / 2 + 20, { n: 14, colors: cols, speed: [200, 700], g: 300, life: [0.4, 0.8] });
          FX.glitter(x, y + T.bandH / 2 - 20, { n: 14, colors: cols, speed: [200, 700], g: 300, life: [0.4, 0.8] });
        }
      }, 140);
    }
    cur = { root, timer: setTimeout(() => { if (cur && cur.root === root) stop(); }, D + 30) };
    return D;
  }

  window.CUTIN = { play, stop, eyes, eyesNow, TIERS };
})();
