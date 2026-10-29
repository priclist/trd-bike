// Rev showcase: scrolling opens the throttle. Hit the redline and it shifts up to the next featured bike.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const section = $("[data-rev]");
  const stage = $("[data-rev-stage]");
  const svg = $("[data-tach]");
  const tachBox = $("[data-tach-box]");
  const giant = $("[data-rev-giant]");
  const layers = [...section.querySelectorAll("[data-rev-bike]")];
  const gearBtn = $("[data-gear]");
  const gearNum = $("[data-gear-num]");
  const gearbox = $("[data-gearbox]");
  const gearsEl = $("[data-gears]");
  const hint = $("[data-rev-hint]");
  const flash = $("[data-rev-flash]");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const phone = matchMedia("(max-width: 760px)");

  const IDLE = 1200, HEAT_FROM = 9000, REDLINE = 10000, SHIFT_AT = 10600, SHIFT_DROP = 6400, MAX = 12000;
  const WDTH_MIN = 78, WDTH_FIT = 108, WDTH_MAX = 150;

  let featured = [];
  let gear = -1, active = 0;
  let rpm = IDLE, vel = 0, target = IDLE;
  let last = 0, raf = 0, visible = false;
  let tach = null; // geometry + live svg nodes

  // ---------- tachometer ----------
  // angles in degrees: 0 is straight up, clockwise is positive
  const polar = (g, r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [g.cx + r * Math.sin(a), g.cy - r * Math.cos(a)];
  };
  const arc = (g, r, from, to) => {
    const [x1, y1] = polar(g, r, from);
    const [x2, y2] = polar(g, r, to);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  function drawTach() {
    const s = stage.getBoundingClientRect();
    const W = s.width, H = s.height;
    const small = phone.matches;
    let g;
    if (small) {
      // half arc under the bike, hub at the bottom of the tach box
      const b = tachBox.getBoundingClientRect();
      const R = Math.max(60, Math.min(W / 2 - 34, b.height - 18));
      g = { cx: W / 2, cy: b.bottom - s.top - 4, R, a0: -90, a1: 90, tick: [6, 14], numR: R + 18, font: 12, stroke: 3 };
    } else {
      // wide arc sweeping behind the bike
      const b = $("[data-rev-bikes]").getBoundingClientRect();
      const R = Math.min(W * 0.31, H * 0.36);
      g = { cx: W / 2, cy: b.top - s.top + b.height * 0.6, R, a0: -108, a1: 108, tick: [12, 30], numR: R + 30, font: Math.round(Math.min(22, Math.max(14, R / 18))), stroke: 5 };
    }
    g.at = (r) => g.a0 + (Math.min(MAX, Math.max(0, r)) / MAX) * (g.a1 - g.a0);

    let ticks = "", nums = "";
    for (let k = 0; k <= 24; k++) {
      const r = k * 500, major = k % 2 === 0, red = r >= REDLINE;
      const [x1, y1] = polar(g, g.R - 4, g.at(r));
      const [x2, y2] = polar(g, g.R - 4 - (major ? g.tick[1] : g.tick[0]), g.at(r));
      ticks += `<line class="tach-tick${major ? " major" : ""}${red ? " red" : ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      if (major) {
        const [tx, ty] = polar(g, g.numR, g.at(r));
        nums += `<text class="tach-num${red ? " red" : ""}" x="${tx.toFixed(1)}" y="${(ty + g.font * 0.36).toFixed(1)}" text-anchor="middle" font-size="${g.font}">${r / 1000}</text>`;
      }
    }
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <path class="tach-track" d="${arc(g, g.R, g.a0, g.a1)}" stroke-width="${g.stroke}"/>
      <path class="tach-zone" d="${arc(g, g.R, g.at(REDLINE), g.a1)}" stroke-width="${g.stroke}"/>
      <path class="tach-sweep" d="${arc(g, g.R, g.a0, g.at(REDLINE))}" pathLength="1" stroke-width="${g.stroke}"/>
      <path class="tach-sweep-red" d="${arc(g, g.R, g.at(REDLINE), g.a1)}" pathLength="1" stroke-width="${g.stroke + 1}"/>
      <g>${ticks}</g><g>${nums}</g>
      <line class="tach-needle" x1="${g.cx}" y1="${g.cy - g.R * (small ? 0.42 : 0.22)}" x2="${g.cx}" y2="${g.cy - g.R - 6}" style="transform-origin:${g.cx}px ${g.cy}px"/>`;
    g.sweep = svg.querySelector(".tach-sweep");
    g.sweepRed = svg.querySelector(".tach-sweep-red");
    g.needle = svg.querySelector(".tach-needle");
    tach = g;
    stage.style.setProperty("--tcx", `${g.cx}px`);
    stage.style.setProperty("--tcy", `${g.cy}px`);
    paint();
  }

  // ---------- odometer readouts ----------
  const DIGITS = [...Array(10).keys()].map((n) => `<i>${n}</i>`).join("");
  function odo(el, text) {
    const chars = [...(text || "–")];
    const pattern = chars.map((c) => (/\d/.test(c) ? "#" : c)).join("");
    if (el.dataset.pattern !== pattern) {
      el.dataset.pattern = pattern;
      el.innerHTML = chars.map((c) => (/\d/.test(c) ? `<span class="odo-d"><span>${DIGITS}</span></span>` : `<span class="odo-s">${c}</span>`)).join("");
      void el.offsetWidth; // start new columns from 0 so they still roll
    }
    const cols = el.querySelectorAll(".odo-d > span");
    let k = 0;
    chars.forEach((c) => {
      if (!/\d/.test(c)) return;
      const col = cols[k];
      col.style.transitionDelay = `${k * 40}ms`;
      col.style.transform = `translateY(${-Number(c) * 10}%)`;
      k++;
    });
  }

  // ---------- giant name: fit it mid-stretch, so near the redline it bleeds off the edges ----------
  function fitGiant() {
    const max = stage.clientWidth * 0.94;
    giant.style.fontVariationSettings = `"wdth" ${WDTH_FIT}`;
    giant.style.fontSize = "100px";
    const w = giant.scrollWidth || 1;
    giant.style.fontSize = Math.min(stage.clientWidth * 0.2, (100 * max) / w) + "px";
    paint();
  }

  // ---------- sound (off until asked for) ----------
  const soundBtn = $("[data-sound]");
  let audio = null;
  const soundOn = () => soundBtn.getAttribute("aria-pressed") === "true";
  function startAudio() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 6;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve;
    const a = ctx.createOscillator(); a.type = "sawtooth";
    const b = ctx.createOscillator(); b.type = "square";
    const bGain = ctx.createGain(); bGain.gain.value = 0.35;
    a.connect(shaper); b.connect(bGain).connect(shaper);
    shaper.connect(filter).connect(master).connect(ctx.destination);
    a.start(); b.start();
    audio = { ctx, master, filter, a, b };
  }
  function updateAudio() {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const f = 34 + (rpm / 60) * 2.1; // twin firing frequency, pitched up a little
    const load = Math.max(0, Math.min(1, vel / 8000));
    audio.a.frequency.setTargetAtTime(f, now, 0.02);
    audio.b.frequency.setTargetAtTime(f / 2, now, 0.02);
    audio.filter.frequency.setTargetAtTime(300 + rpm * 0.35 + load * 900, now, 0.03);
    audio.master.gain.setTargetAtTime(soundOn() && visible ? 0.06 + load * 0.1 : 0, now, 0.05);
  }
  soundBtn.addEventListener("click", () => {
    const on = !soundOn();
    soundBtn.setAttribute("aria-pressed", on);
    if (on && !audio) startAudio();
    if (audio) { audio.ctx.resume(); updateAudio(); }
  });

  // ---------- bikes ----------
  function fillLayer(fig, b) {
    fig.querySelectorAll("img").forEach((im) => {
      im.classList.remove("is-photo");
      im.setAttribute("data-cut", "");
      im.dataset.fb = [b.images[0], b.fallbacks[0]].filter((s, n, a) => s && a.indexOf(s) === n).join(" ");
      im.src = b.cutout;
    });
    fig.querySelector("img").alt = b.title;
  }

  const ease = { out: "cubic-bezier(.5,0,.75,0)", slam: "cubic-bezier(.16,1,.3,1)", punch: "cubic-bezier(.2,1.6,.4,1)" };
  function showBike(i, dir) {
    const b = featured[i];
    if (!b || i === gear) return;
    gear = i;
    const out = layers[active];
    const inn = layers[(active = 1 - active)];
    fillLayer(inn, b);
    out.getAnimations().forEach((a) => a.cancel());
    inn.getAnimations().forEach((a) => a.cancel());
    out.classList.remove("on");
    inn.classList.add("on");

    if (dir && !reduceMotion.matches) {
      // the shift: flash, old bike blurs out, new bike slams in, gear number punches in
      out.animate([
        { transform: "none", filter: "blur(0)", opacity: 1 },
        { transform: `translateX(${-dir * 42}vw) skewX(${dir * 10}deg)`, filter: "blur(18px)", opacity: 0 },
      ], { duration: 340, easing: ease.out });
      inn.animate([
        { transform: `translateX(${dir * 55}vw) scale(1.08) skewX(${-dir * 8}deg)`, filter: "blur(20px)", opacity: 0 },
        { transform: `translateX(${-dir * 1.2}vw) scale(1)`, filter: "blur(0)", opacity: 1, offset: 0.62 },
        { transform: "none", filter: "blur(0)", opacity: 1 },
      ], { duration: 560, delay: 110, easing: ease.slam, fill: "backwards" });
      flash.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 300, easing: "ease-out" });
      gearNum.animate([{ transform: "scale(2.2)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: ease.punch });
      giant.animate([{ opacity: 0, transform: `translateX(${dir * 6}vw)` }, { opacity: 1, transform: "none" }], { duration: 520, delay: 90, easing: ease.slam, fill: "backwards" });
    }

    section.style.setProperty("--accent", TRD.accentOf(b));
    gearNum.textContent = i + 1;
    gearsEl.querySelectorAll("button").forEach((g, n) => g.setAttribute("aria-current", n === i));
    giant.textContent = b.model || b.title;
    $("[data-rev-make]").textContent = [b.year, b.makeLabel].filter(Boolean).join(" ");
    $("[data-rev-name]").textContent = b.model || b.title;
    odo($('[data-odo="price"]'), b.price ? TRD.money(b.price) : "");
    odo($('[data-odo="km"]'), b.mileage_km != null ? TRD.num(b.mileage_km) : "");
    odo($('[data-odo="cc"]'), b.engine_cc ? TRD.num(b.engine_cc) : "");
    $("[data-rev-live]").textContent = [`Gear ${i + 1}: ${b.title}`, b.price && TRD.money(b.price), b.mileage_km != null && TRD.km(b.mileage_km), b.engine_cc && `${TRD.num(b.engine_cc)} cc`]
      .filter(Boolean).join(", ");
    hint.classList.toggle("gone", i > 0);
    fitGiant();
  }

  // ---------- scroll → throttle ----------
  const travel = () => section.offsetHeight - innerHeight;
  function progress() {
    return Math.max(0, Math.min(0.99999, -section.getBoundingClientRect().top / travel()));
  }
  function readScroll() {
    if (!featured.length || !visible) return;
    const seg = progress() * featured.length;
    const g = Math.floor(seg);
    const t = seg - g;
    target = (g === 0 ? IDLE : SHIFT_DROP) + Math.min(1, t / 0.9) * (SHIFT_AT - (g === 0 ? IDLE : SHIFT_DROP));
    if (g !== gear) {
      if (g > gear && gear >= 0) { rpm = SHIFT_DROP; vel = 0; } // revs drop as the clutch bites
      showBike(g, gear < 0 ? 1 : Math.sign(g - gear)); // the first bike slams in as the hero hands over
    }
    hint.classList.toggle("gone", gear > 0 || progress() > 0.04);
    kick();
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function paint() {
    if (!tach) return;
    const angle = tach.at(rpm);
    tach.needle.style.transform = `rotate(${angle}deg)`;
    tach.sweep.style.strokeDasharray = `${clamp01((rpm - 0) / REDLINE)} 1`;
    tach.sweepRed.style.strokeDasharray = `${clamp01((rpm - REDLINE) / (MAX - REDLINE))} 1`;
    svg.classList.toggle("redline", rpm >= REDLINE);
    const t = clamp01((rpm - IDLE) / (SHIFT_AT - IDLE));
    giant.style.fontVariationSettings = `"wdth" ${(WDTH_MIN + t * (WDTH_MAX - WDTH_MIN)).toFixed(1)}`;

    // redline tension: edge glow, streaks and a shake that eases off once the needle stops moving
    const heat = reduceMotion.matches ? 0 : clamp01((rpm - HEAT_FROM) / (SHIFT_AT - HEAT_FROM));
    stage.style.setProperty("--heat", heat.toFixed(3));
    stage.classList.toggle("hot", heat > 0.02);
    const shake = heat * (0.35 + 0.65 * clamp01(Math.abs(vel) / 3000)) * 3.2;
    stage.style.setProperty("--sx", `${((Math.random() - 0.5) * shake).toFixed(2)}px`);
    stage.style.setProperty("--sy", `${((Math.random() - 0.5) * shake).toFixed(2)}px`);
  }

  // critically damped spring toward the scroll target, so jumps in scroll still read as a needle with mass
  const K = (2 * Math.PI / 0.28) ** 2, C = 2 * Math.sqrt(K);
  function step(now) {
    const dt = Math.min(0.032, (now - (last || now)) / 1000);
    last = now;
    if (reduceMotion.matches) { rpm = target; vel = 0; }
    else {
      vel += (K * (target - rpm) - C * vel) * dt;
      rpm = Math.max(IDLE * 0.9, Math.min(MAX, rpm + vel * dt));
    }
    paint();
    updateAudio();
    const settled = Math.abs(target - rpm) < 2 && Math.abs(vel) < 2;
    // keep idling at the redline so it stays tense while you hold it there
    if (visible && (!settled || (rpm > HEAT_FROM && !reduceMotion.matches))) raf = requestAnimationFrame(step);
    else { raf = 0; last = 0; updateAudio(); }
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(step); }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) readScroll(); else updateAudio();
  }).observe(section);
  addEventListener("scroll", () => { if (visible) readScroll(); }, { passive: true });

  // ---------- gearbox: jump straight to a bike ----------
  const setBox = (open) => {
    gearbox.hidden = !open;
    gearBtn.setAttribute("aria-expanded", open);
    if (open) (gearsEl.querySelector('[aria-current="true"]') || gearsEl.querySelector("button")).focus();
  };
  gearBtn.addEventListener("click", () => setBox(gearbox.hidden));
  gearsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-gear-pick]");
    if (!btn) return;
    const i = Number(btn.dataset.gearPick);
    const top = section.getBoundingClientRect().top + scrollY + ((i + 0.3) / featured.length) * travel();
    setBox(false);
    gearBtn.focus();
    scrollTo({ top, behavior: "instant" });
  });
  gearbox.addEventListener("keydown", (e) => {
    const items = [...gearsEl.querySelectorAll("button")];
    const n = items.indexOf(document.activeElement);
    if (e.key === "Escape") { setBox(false); gearBtn.focus(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(n + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    }
  });
  document.addEventListener("click", (e) => { if (!gearbox.hidden && !e.target.closest(".gear-wrap")) setBox(false); });
  $("[data-rev-open]").addEventListener("click", () => featured[gear] && TRD.openBike(featured[gear].id));

  // ---------- boot ----------
  let resizeT = 0;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { drawTach(); fitGiant(); }, 80); });
  phone.addEventListener("change", drawTach);
  document.fonts.ready.then(fitGiant);
  drawTach();

  TRD.ready.then((bikes) => {
    featured = TRD.pickFeatured(bikes, 6);
    section.style.setProperty("--gears", featured.length);
    featured.forEach((b) => { const i = new Image(); i.src = b.cutout; });
    gearsEl.innerHTML = featured.map((b, i) => `
      <li><button type="button" data-gear-pick="${i}" style="--accent:${TRD.accentOf(b)}">
        <span class="gb-num">${i + 1}</span>
        <span class="gb-name">${TRD.esc(b.title)}</span>
        <span class="gb-price">${TRD.money(b.price)}</span>
      </button></li>`).join("");
    drawTach();
    readScroll();
  });
})();
