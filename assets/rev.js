// Rev section: scrolling opens the throttle. Hit the redline and it shifts up to the next featured bike.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const section = $("[data-rev]");
  const title = $("[data-rev-title]");
  const needle = $("[data-needle]");
  const rpmText = $("[data-rpm]");
  const gearNum = $("[data-gear-num]");
  const lightsEl = $("[data-lights]");
  const frame = $("[data-rev-frame]");
  const img = $("[data-rev-img]");
  const imgNext = $("[data-rev-img-next]");
  const gearsEl = $("[data-gears]");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const IDLE = 1200, SHIFT_AT = 10600, SHIFT_DROP = 6400, REDLINE = 10000, MAX = 12000, GEARS = 6;
  const WDTH_MIN = 72, WDTH_MAX = 130;

  let featured = [];
  let gear = -1;
  let rpm = IDLE, vel = 0, target = IDLE;
  let last = 0, raf = 0, visible = false;

  // ---------- tach face ----------
  const angleFor = (r) => -135 + (r / MAX) * 270; // 0 rpm = bottom-left, 12k = bottom-right
  const polar = (deg, radius) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [200 + radius * Math.cos(a), 200 + radius * Math.sin(a)];
  };
  (function drawTach() {
    let svg = "";
    for (let k = 0; k <= 24; k++) {
      const r = k * 500, major = k % 2 === 0, red = r >= REDLINE;
      const [x1, y1] = polar(angleFor(r), 176);
      const [x2, y2] = polar(angleFor(r), major ? 150 : 162);
      svg += `<line class="tach-tick${major ? " major" : ""}${red ? " red" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      if (major) {
        const [tx, ty] = polar(angleFor(r), 126);
        svg += `<text class="tach-num${red ? " red" : ""}" x="${tx}" y="${ty + 9}" text-anchor="middle">${r / 1000}</text>`;
      }
    }
    $("[data-ticks]").innerHTML = svg;
    const [sx, sy] = polar(angleFor(REDLINE), 169);
    const [ex, ey] = polar(angleFor(MAX), 169);
    $("[data-redline]").setAttribute("d", `M${sx} ${sy} A169 169 0 0 1 ${ex} ${ey}`);
    lightsEl.innerHTML = "wwwwyyyrrr".split("").map((c) => `<i class="${c}"></i>`).join("");
  })();
  const lights = [...lightsEl.children];

  // ---------- headline: fit the fully stretched width, then let rpm stretch it ----------
  function fitTitle() {
    const box = title.getBoundingClientRect().width;
    title.style.fontVariationSettings = `"wdth" ${WDTH_MAX}`;
    title.style.fontSize = "100px";
    const widest = Math.max(...[...title.children].map((s) => s.scrollWidth));
    title.style.fontSize = Math.min(132, (100 * box) / widest) + "px";
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
    soundBtn.querySelector("span").textContent = on ? "Engine sound on" : "Engine sound off";
    if (on && !audio) startAudio();
    if (audio) { audio.ctx.resume(); updateAudio(); }
  });

  // ---------- featured bikes ----------
  function showBike(index, animate) {
    const b = featured[index];
    if (!b || index === gear) return;
    gear = index;
    gearNum.textContent = index + 1;
    gearsEl.querySelectorAll("button").forEach((g, n) => g.setAttribute("aria-current", n === index));
    $("[data-rev-make]").textContent = [b.year, b.makeLabel].filter(Boolean).join(" ");
    $("[data-rev-name]").textContent = b.model || b.title;
    $("[data-rev-meta]").textContent = [TRD.money(b.price), b.mileage_km != null && TRD.km(b.mileage_km), b.engine_cc && b.engine_cc + " cc"]
      .filter(Boolean).join(", ");

    const src = b.images[0];
    const fb = b.fallbacks[0] || "";
    if (!animate || reduceMotion.matches) { img.dataset.fb = fb; img.src = src; img.alt = b.title; return; }
    imgNext.dataset.fb = fb;
    imgNext.src = src;
    frame.classList.remove("wipe");
    void frame.offsetWidth;
    frame.classList.add("wipe");
    clearTimeout(showBike.t);
    showBike.t = setTimeout(() => {
      img.dataset.fb = fb; img.src = src; img.alt = b.title;
      frame.classList.remove("wipe");
    }, 460);
  }

  // ---------- scroll → throttle ----------
  function progress() {
    const r = section.getBoundingClientRect();
    const travel = section.offsetHeight - innerHeight;
    return Math.max(0, Math.min(0.99999, -r.top / travel));
  }
  function readScroll() {
    const seg = progress() * GEARS;
    const g = Math.floor(seg);
    const t = seg - g;
    target = (g === 0 ? IDLE : SHIFT_DROP) + Math.min(1, t / 0.92) * (SHIFT_AT - (g === 0 ? IDLE : SHIFT_DROP));
    if (featured.length && g !== gear) {
      if (g > gear && gear >= 0) { rpm = SHIFT_DROP; vel = 0; } // the shift: revs drop as the clutch bites
      showBike(Math.min(g, featured.length - 1), gear >= 0);
    }
    kick();
  }

  function paint() {
    needle.style.transform = `rotate(${angleFor(rpm)}deg)`;
    rpmText.textContent = `${(Math.round(rpm / 100) * 100).toLocaleString("fr-FR")} rpm`;
    const t = Math.max(0, Math.min(1, (rpm - IDLE) / (SHIFT_AT - IDLE)));
    title.style.fontVariationSettings = `"wdth" ${WDTH_MIN + t * (WDTH_MAX - WDTH_MIN)}`;
    const lit = Math.round(Math.max(0, (rpm - 5600) / (REDLINE - 5600)) * lights.length);
    lights.forEach((l, i) => l.classList.toggle("on", i < lit));
    lightsEl.classList.toggle("flash", rpm >= REDLINE);
    section.classList.toggle("shake", rpm > 8600 && !reduceMotion.matches);
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
    if (visible && !settled) raf = requestAnimationFrame(step);
    else { raf = 0; last = 0; updateAudio(); }
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(step); }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) readScroll(); else updateAudio();
  }).observe(section);
  addEventListener("scroll", () => { if (visible) readScroll(); }, { passive: true });

  gearsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const i = [...gearsEl.querySelectorAll("button")].indexOf(btn);
    const travel = section.offsetHeight - innerHeight;
    const top = section.getBoundingClientRect().top + scrollY + ((i + 0.5) / GEARS) * travel;
    scrollTo({ top, behavior: reduceMotion.matches ? "auto" : "smooth" });
  });
  $("[data-rev-open]").addEventListener("click", () => featured[gear] && TRD.openBike(featured[gear].id));

  // ---------- boot ----------
  document.fonts.ready.then(fitTitle);
  addEventListener("resize", fitTitle);
  needle.style.transform = `rotate(${angleFor(IDLE)}deg)`;

  TRD.ready.then((bikes) => {
    featured = TRD.pickFeatured(bikes, GEARS);
    featured.forEach((b) => { const i = new Image(); i.src = b.images[0]; });
    gearsEl.innerHTML = featured
      .map((b, i) => `<li><button type="button" aria-label="Gear ${i + 1}: ${b.title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}">${i + 1}</button></li>`)
      .join("");
    showBike(0, false);
    readScroll();
  });
})();
