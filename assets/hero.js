// Hero rev counter: hold the throttle, hit the redline, shift up to the next featured bike.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const hero = $(".hero");
  const headline = $("[data-headline]");
  const throttleBtn = $("[data-throttle]");
  const needle = $("[data-needle]");
  const rpmText = $("[data-rpm]");
  const gearNum = $("[data-gear-num]");
  const lightsEl = $("[data-lights]");
  const road = $("[data-road]");
  const frame = $(".bike-frame");
  const img = $("[data-hero-img]");
  const imgNext = $("[data-hero-img-next]");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const IDLE = 1200, SHIFT_AT = 10600, REDLINE = 10000, MAX = 12000, GEARS = 6;
  const WDTH_MIN = 72, WDTH_MAX = 150;

  let featured = [];
  let gear = 0;           // index into featured
  let rpm = IDLE;
  let open = false;       // throttle held
  let last = 0;
  let raf = 0;
  let roadX = 0;

  // ---------- tach face ----------
  const angleFor = (r) => -135 + (r / MAX) * 270; // 0 rpm = bottom-left, 12k = bottom-right
  const polar = (deg, radius) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [200 + radius * Math.cos(a), 200 + radius * Math.sin(a)];
  };
  (function drawTach() {
    const ticks = $("[data-ticks]");
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
    ticks.innerHTML = svg;
    const [sx, sy] = polar(angleFor(REDLINE), 169);
    const [ex, ey] = polar(angleFor(MAX), 169);
    $("[data-redline]").setAttribute("d", `M${sx} ${sy} A169 169 0 0 1 ${ex} ${ey}`);
    lightsEl.innerHTML = "wwwwyyyrrr".split("").map((c) => `<i class="${c}"></i>`).join("");
  })();
  const lights = [...lightsEl.children];

  // ---------- headline sizing: fit the fully stretched width, then let rpm stretch it ----------
  function fitHeadline() {
    const box = headline.parentElement.clientWidth;
    headline.style.fontVariationSettings = `"wdth" ${WDTH_MAX}`;
    headline.style.fontSize = "100px";
    const widest = Math.max(...[...headline.children].map((s) => s.scrollWidth));
    headline.style.fontSize = Math.min(150, (100 * box) / widest) + "px";
    setStretch();
  }
  function setStretch() {
    const t = Math.max(0, Math.min(1, (rpm - IDLE) / (SHIFT_AT - IDLE)));
    headline.style.fontVariationSettings = `"wdth" ${WDTH_MIN + t * (WDTH_MAX - WDTH_MIN)}`;
  }

  // ---------- sound (off until asked for) ----------
  const soundBtn = $("[data-sound]");
  let audio = null;
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
    audio.a.frequency.setTargetAtTime(f, now, 0.02);
    audio.b.frequency.setTargetAtTime(f / 2, now, 0.02);
    audio.filter.frequency.setTargetAtTime(300 + rpm * 0.35 + (open ? 900 : 0), now, 0.03);
    audio.master.gain.setTargetAtTime(soundBtn.getAttribute("aria-pressed") === "true" ? (open ? 0.16 : 0.07) : 0, now, 0.05);
  }
  soundBtn.addEventListener("click", () => {
    const on = soundBtn.getAttribute("aria-pressed") !== "true";
    soundBtn.setAttribute("aria-pressed", on);
    soundBtn.textContent = on ? "Sound on" : "Sound off";
    if (on && !audio) startAudio();
    if (audio) { audio.ctx.resume(); updateAudio(); }
    kick();
  });

  // ---------- featured bikes ----------
  const gearsEl = $("[data-gears]");
  function showBike(index, animate) {
    const b = featured[index];
    if (!b) return;
    gear = index;
    gearNum.textContent = index + 1;
    gearsEl.querySelectorAll("button").forEach((g, n) => g.setAttribute("aria-current", n === index));
    $("[data-hero-title]").textContent = b.title;
    $("[data-hero-meta]").textContent = [TRD.money(b.price), b.mileage_km != null && TRD.km(b.mileage_km), b.engine_cc && b.engine_cc + " cc"]
      .filter(Boolean).join(", ");

    const src = b.images[0];
    if (!animate || reduceMotion.matches) { img.src = src; img.alt = b.title; return; }
    imgNext.src = src;
    frame.classList.remove("wipe");
    void frame.offsetWidth;
    frame.classList.add("wipe");
    setTimeout(() => {
      img.src = src; img.alt = b.title;
      frame.classList.remove("wipe");
    }, 460);
  }

  function shiftUp() {
    rpm = 6400;
    lightsEl.classList.remove("flash");
    showBike((gear + 1) % featured.length, true);
  }

  // ---------- loop ----------
  function frameStep(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;

    if (open) {
      rpm += (9200 - gear * 750) * dt;          // lower gears rev faster
      if (rpm >= SHIFT_AT) shiftUp();
    } else {
      rpm -= ((rpm - IDLE) * 2.6 + 900) * dt;   // engine braking back to idle
      rpm = Math.max(IDLE, rpm);
    }

    needle.style.transform = `rotate(${angleFor(rpm)}deg)`;
    rpmText.textContent = `${(Math.round(rpm / 100) * 100).toLocaleString("fr-FR")} rpm`;
    setStretch();
    const lit = Math.round(Math.max(0, (rpm - 5600) / (REDLINE - 5600)) * lights.length);
    lights.forEach((l, i) => l.classList.toggle("on", i < lit));
    lightsEl.classList.toggle("flash", rpm >= REDLINE);
    hero.classList.toggle("shake", rpm > 8000 && !reduceMotion.matches);

    if (!reduceMotion.matches) {
      roadX = (roadX + (rpm - IDLE) * (gear + 1) * 0.012 * dt) % 160;
      road.style.transform = `translateX(${-roadX}px)`;
    }
    updateAudio();

    if (open || rpm > IDLE + 1) raf = requestAnimationFrame(frameStep);
    else { raf = 0; last = 0; }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frameStep); }

  function setThrottle(on) {
    if (open === on) return;
    open = on;
    throttleBtn.classList.toggle("is-on", on);
    kick();
  }

  // pointer: press and hold the grip
  throttleBtn.addEventListener("pointerdown", (e) => { throttleBtn.setPointerCapture(e.pointerId); setThrottle(true); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => throttleBtn.addEventListener(ev, () => setThrottle(false)));
  throttleBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  // keyboard: hold space anywhere in the hero view (or Enter/Space on the button)
  const typing = (el) => el.closest?.("input, textarea, select, dialog, [contenteditable]");
  const heroInView = () => hero.getBoundingClientRect().bottom > innerHeight * 0.35;
  addEventListener("keydown", (e) => {
    if ((e.code === "Space" || (e.key === "Enter" && e.target === throttleBtn)) && !typing(e.target) && heroInView()) {
      if (e.target.tagName === "BUTTON" && e.target !== throttleBtn) return;
      e.preventDefault();
      setThrottle(true);
    }
  });
  addEventListener("keyup", (e) => { if (e.code === "Space" || e.key === "Enter") setThrottle(false); });
  addEventListener("blur", () => setThrottle(false));
  throttleBtn.addEventListener("click", (e) => e.preventDefault());

  $("[data-hero-open]").addEventListener("click", () => featured[gear] && TRD.openBike(featured[gear].id));

  // ---------- boot ----------
  document.fonts.ready.then(fitHeadline);
  addEventListener("resize", fitHeadline);

  TRD.ready.then((bikes) => {
    // specials first, then the priciest bike from each make: six gears, six different makes
    const withPhotos = bikes.filter((b) => b.images.length && b.price);
    const ranked = [...withPhotos].sort((a, b) => (!!b.wasPrice - !!a.wasPrice) || b.price - a.price);
    const seen = new Set();
    for (const b of ranked) {
      if (featured.length === GEARS) break;
      if (seen.has(b.makeLabel)) continue;
      seen.add(b.makeLabel);
      featured.push(b);
    }
    gearsEl.innerHTML = featured
      .map((b, i) => `<li><button type="button" aria-label="Gear ${i + 1}: ${b.title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}">${i + 1}</button></li>`)
      .join("");
    gearsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) showBike([...gearsEl.querySelectorAll("button")].indexOf(btn), true);
    });
    showBike(0, false);
    needle.style.transform = `rotate(${angleFor(IDLE)}deg)`;
  });
})();
